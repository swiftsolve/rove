//! The speed test: adaptive download and upload against Cloudflare, plus what
//! the result is good enough for.

use crate::capabilities::{assess, CapabilityRating};
use crate::diagnostics::{ping, PingStats};
use bytes::Bytes;
use futures_util::{stream, StreamExt};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedResult {
    pub download_mbps: f64,
    pub upload_mbps: f64,
    pub latency_ms: f64,
    pub jitter_ms: f64,
    pub packet_loss: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedTestResult {
    pub internet: SpeedResult,
    pub capabilities: Vec<CapabilityRating>,
    pub link_capacity_mbps: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedTestProgress {
    pub phase: String,
    pub message: String,
    pub progress: u8,
}

/// The error a cancelled test returns; `useSpeedTest` matches on it to tell a
/// cancel from a failure.
pub const CANCELLED: &str = "SPEED_TEST_CANCELLED";

/// Download endpoints, tried in order. Cloudflare first: its anycast network is
/// near almost everywhere and built for parallel tests, so stacking connections
/// measures the link, not an origin cap. Two caveats:
///   - `__down` caps `bytes` just under 100 MB (`100_000_000` returns 403), so we
///     ask for 90 MB. Workers refetch when a file drains, over a kept-alive
///     connection, so a refetch pays no fresh slow-start.
///   - Cloudflare rate-limits by request volume and returns 429 under heavy
///     use. A worker then moves to `DataPacket`, a CDN test file that doesn't
///     throttle per connection, so download still reports a real number.
const DOWNLOAD_URLS: [&str; 2] =
    ["https://speed.cloudflare.com/__down?bytes=90000000", "https://nyc.download.datapacket.com/100mb.bin"];
const UPLOAD_URL: &str = "https://speed.cloudflare.com/__up";
const PING_HOST: &str = "1.1.1.1";

// One TCP connection keeps only bandwidth×RTT bytes in flight before waiting
// on ACKs, so on a fast link it tops out well below line rate. Too few
// connections undershoot gigabit; too many waste setup on a slow link. So the
// count ramps up during warmup until aggregate throughput stops climbing.
const MIN_CONNS: usize = 4;
const MAX_CONNS: usize = 32;
/// Connections added each ramp step while throughput is still climbing.
const RAMP_STEP: usize = 4;
/// How often the ramp controller samples aggregate throughput.
const RAMP_SAMPLE: Duration = Duration::from_millis(300);
/// Add another batch only if the latest sample's rate beats the previous by
/// more than this fraction; below it we treat the link as saturated.
const RAMP_GROWTH_THRESHOLD: f64 = 0.12;

/// Ramp-up at the start of each phase. Its bytes are discarded so slow-start
/// doesn't drag the result down, and the connection ramp runs inside it so the
/// measurement window starts saturated.
const WARMUP: Duration = Duration::from_secs(3);
/// Measurement window, timed after warmup completes.
const WINDOW: Duration = Duration::from_secs(6);
/// Idle gap between phases so the link settles before the next measurement.
const SETTLE: Duration = Duration::from_secs(1);

/// Per-request ceiling for the transfer clients. Longer than a whole phase
/// (warmup plus window), so it only catches a request that hangs.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);
/// A download stream that delivers nothing for this long is dropped and
/// refetched, so a stalled connection can't sit out the window.
const STALL_TIMEOUT: Duration = Duration::from_secs(3);
/// Pause after an endpoint refuses a download, so a worker neither hammers a
/// rate-limited origin nor spins.
const REFUSAL_BACKOFF: Duration = Duration::from_millis(250);

fn round1(v: f64) -> f64 {
    (v * 10.0).round() / 10.0
}

fn mbps(bytes: u64, elapsed: Duration) -> f64 {
    let secs = elapsed.as_secs_f64().max(0.001);
    bytes as f64 * 8.0 / 1_000_000.0 / secs
}

/// Shared throughput counters for one measurement phase. `raw` counts every
/// byte and drives the ramp controller (which needs a live signal during
/// warmup); `counted` only accrues bytes transferred after `measure_start` and
/// is what the final rate is computed from.
#[derive(Clone)]
struct Counters {
    raw: Arc<AtomicU64>,
    counted: Arc<AtomicU64>,
}

impl Counters {
    fn new() -> Self {
        Self { raw: Arc::new(AtomicU64::new(0)), counted: Arc::new(AtomicU64::new(0)) }
    }

    /// Record `n` transferred bytes; `now` decides whether they fall in the
    /// measured window.
    fn add(&self, n: u64, now: Instant, measure_start: Instant) {
        self.raw.fetch_add(n, Ordering::Relaxed);
        if now >= measure_start {
            self.counted.fetch_add(n, Ordering::Relaxed);
        }
    }
}

/// Run one phase's connection ramp: start `MIN_CONNS` workers, then add
/// `RAMP_STEP` more each sample while the rate still climbs, up to `MAX_CONNS`.
/// The set is held steady once the measurement window opens. Returns the bytes
/// transferred within the window.
async fn adaptive_transfer(
    counters: &Counters,
    measure_start: Instant,
    deadline: Instant,
    cancel: &Arc<AtomicBool>,
    mut spawn_worker: impl FnMut() -> tokio::task::JoinHandle<()>,
) -> u64 {
    let mut handles: Vec<_> = (0..MIN_CONNS).map(|_| spawn_worker()).collect();
    let mut conns = MIN_CONNS;
    let mut last_sample_bytes = 0u64;
    let mut last_rate = 0.0f64;
    let mut saturated = false;

    while Instant::now() < deadline && !cancel.load(Ordering::Relaxed) {
        tokio::time::sleep(RAMP_SAMPLE).await;

        let total = counters.raw.load(Ordering::Relaxed);
        let rate = total.saturating_sub(last_sample_bytes) as f64 / RAMP_SAMPLE.as_secs_f64();
        last_sample_bytes = total;

        if !saturated && Instant::now() < measure_start && conns < MAX_CONNS {
            if rate > last_rate * (1.0 + RAMP_GROWTH_THRESHOLD) {
                let step = RAMP_STEP.min(MAX_CONNS - conns);
                handles.extend((0..step).map(|_| spawn_worker()));
                conns += step;
            } else {
                saturated = true;
            }
        }
        last_rate = rate;
    }

    // Workers exit on their own at the deadline; just drain them.
    for handle in handles {
        let _ = handle.await;
    }
    counters.counted.load(Ordering::Relaxed)
}

/// One download connection, pulling the file back-to-back until the deadline.
/// On refusal it advances to the next endpoint, so once Cloudflare 429s the
/// worker settles on the fallback instead of retrying it every fetch.
async fn download_worker(
    client: reqwest::Client,
    measure_start: Instant,
    deadline: Instant,
    cancel: Arc<AtomicBool>,
    counters: Counters,
) {
    let mut url_index = 0usize;
    while Instant::now() < deadline && !cancel.load(Ordering::Relaxed) {
        let url = DOWNLOAD_URLS[url_index % DOWNLOAD_URLS.len()];
        let response = match client.get(url).send().await {
            Ok(r) if r.status().is_success() => r,
            // A refusal's tiny error body mustn't count as throughput.
            _ => {
                url_index += 1;
                tokio::time::sleep(REFUSAL_BACKOFF).await;
                continue;
            }
        };
        let mut stream = response.bytes_stream();

        while let Ok(Some(chunk)) = tokio::time::timeout(STALL_TIMEOUT, stream.next()).await {
            let Ok(chunk) = chunk else { break };
            let now = Instant::now();
            counters.add(chunk.len() as u64, now, measure_start);
            if now >= deadline || cancel.load(Ordering::Relaxed) {
                return;
            }
        }
    }
}

pub async fn measure_download(cancel: &Arc<AtomicBool>) -> f64 {
    // HTTP/1.1 only: over HTTP/2 reqwest coalesces every worker onto one TCP
    // connection, whose shared flow-control window collapses the measured rate.
    // HTTP/1.1 can't multiplex, so each worker gets its own connection.
    let Ok(client) = reqwest::Client::builder().timeout(REQUEST_TIMEOUT).http1_only().build() else {
        tracing::error!("could not build HTTP client for download test");
        return 0.0;
    };
    let start = Instant::now();
    let measure_start = start + WARMUP;
    let deadline = measure_start + WINDOW;
    let counters = Counters::new();

    let spawn =
        || tokio::spawn(download_worker(client.clone(), measure_start, deadline, cancel.clone(), counters.clone()));

    let bytes = adaptive_transfer(&counters, measure_start, deadline, cancel, spawn).await;
    mbps(bytes, start.elapsed().saturating_sub(WARMUP))
}

/// One upload connection: a single chunked POST whose body is fed on demand.
/// Counting only completed POSTs would drop in-flight bytes and quantise the
/// result to whole requests. The HTTP layer pulls a chunk only when the socket
/// has room, so tallying pulls tracks the real send rate through backpressure.
async fn upload_worker(
    client: reqwest::Client,
    payload: Bytes,
    measure_start: Instant,
    deadline: Instant,
    cancel: Arc<AtomicBool>,
    counters: Counters,
) {
    while Instant::now() < deadline && !cancel.load(Ordering::Relaxed) {
        let payload = payload.clone();
        let cancel = cancel.clone();
        let counters = counters.clone();
        let body = reqwest::Body::wrap_stream(stream::unfold((), move |()| {
            let payload = payload.clone();
            let cancel = cancel.clone();
            let counters = counters.clone();
            async move {
                let now = Instant::now();
                if now >= deadline || cancel.load(Ordering::Relaxed) {
                    return None;
                }
                counters.add(payload.len() as u64, now, measure_start);
                Some((Ok::<_, std::io::Error>(payload), ()))
            }
        }));
        // A successful POST ends only at the deadline; an error ends the run.
        if client.post(UPLOAD_URL).body(body).send().await.is_err() {
            break;
        }
    }
}

pub async fn measure_upload(cancel: &Arc<AtomicBool>) -> f64 {
    // HTTP/1.1 only, as for download: one connection per worker.
    let Ok(client) = reqwest::Client::builder().timeout(REQUEST_TIMEOUT).http1_only().build() else {
        tracing::error!("could not build HTTP client for upload test");
        return 0.0;
    };

    // Random so nothing on the path can compress it; shared as a cheap
    // refcounted clone. 64 KB keeps the count fine-grained on slow uplinks.
    use rand::RngCore;
    let mut buf = vec![0u8; 64 * 1024];
    rand::thread_rng().fill_bytes(&mut buf);
    let payload = Bytes::from(buf);

    let start = Instant::now();
    let measure_start = start + WARMUP;
    let deadline = measure_start + WINDOW;
    let counters = Counters::new();

    let spawn = || {
        tokio::spawn(upload_worker(
            client.clone(),
            payload.clone(),
            measure_start,
            deadline,
            cancel.clone(),
            counters.clone(),
        ))
    };

    let bytes = adaptive_transfer(&counters, measure_start, deadline, cancel, spawn).await;
    mbps(bytes, start.elapsed().saturating_sub(WARMUP))
}

/// Full test. `report` receives phase updates; `cancel` aborts between and
/// within phases (streams poll it each chunk).
///
/// `link_capacity_mbps` is left `None` for the caller to fill: it needs a full
/// `network_info()` probe (10 s+ on Windows with a VPN and other virtual
/// adapters), and waiting on it froze the UI at "Starting speed test…". The
/// command runs that probe alongside the test instead.
pub async fn run<F: Fn(SpeedTestProgress)>(cancel: Arc<AtomicBool>, report: F) -> Result<SpeedTestResult, String> {
    let ensure_not_cancelled = || {
        if cancel.load(Ordering::Relaxed) {
            Err(CANCELLED.to_string())
        } else {
            Ok(())
        }
    };

    report(SpeedTestProgress { phase: "internet".into(), message: "Testing download speed…".into(), progress: 15 });
    let download = measure_download(&cancel).await;
    ensure_not_cancelled()?;

    tokio::time::sleep(SETTLE).await;
    ensure_not_cancelled()?;

    report(SpeedTestProgress { phase: "internet".into(), message: "Testing upload speed…".into(), progress: 55 });
    let upload = measure_upload(&cancel).await;
    ensure_not_cancelled()?;

    report(SpeedTestProgress { phase: "internet".into(), message: "Measuring latency…".into(), progress: 85 });
    let ping_stats = ping(PING_HOST, 10).await.unwrap_or(PingStats::UNREACHABLE);
    ensure_not_cancelled()?;

    let internet = SpeedResult {
        download_mbps: round1(download),
        upload_mbps: round1(upload),
        latency_ms: round1(ping_stats.avg_ms),
        jitter_ms: round1(ping_stats.jitter_ms),
        packet_loss: ping_stats.packet_loss,
    };

    report(SpeedTestProgress { phase: "complete".into(), message: "Speed test complete".into(), progress: 100 });

    Ok(SpeedTestResult {
        capabilities: assess(&internet),
        internet,
        link_capacity_mbps: None, // filled in by the caller
    })
}
