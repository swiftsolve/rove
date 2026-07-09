use crate::capabilities::assess;
use crate::diagnostics::ping;
use crate::types::{SpeedResult, SpeedTestProgress, SpeedTestResult};
use bytes::Bytes;
use futures_util::{stream, StreamExt};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

pub const CANCELLED: &str = "SPEED_TEST_CANCELLED";

// Download endpoints, tried in order. Cloudflare is primary: its anycast network
// is local and fast almost everywhere and is purpose-built for parallel speed
// tests, so stacking connections on it measures the link rather than an origin
// cap. Two caveats drive the details:
//   - Its __down endpoint caps the `bytes` parameter just under 100 MB
//     (100_000_000 exactly returns 403), so we request 90 MB — the largest round
//     size safely under the cap. Workers refetch when a file drains, but the
//     client keeps the TCP connection alive between fetches so the congestion
//     window carries over and a refetch pays no fresh slow-start.
//   - Cloudflare rate-limits by request volume and will start returning 429 under
//     heavy or repeated use. When that happens a worker advances to the fallback
//     (DataPacket, a CDN speed-test file — not an origin that per-connection
//     throttles) so download still reports a real number instead of zero.
const DOWNLOAD_URLS: [&str; 2] = [
    "https://speed.cloudflare.com/__down?bytes=90000000",
    "https://nyc.download.datapacket.com/100mb.bin",
];
const UPLOAD_URL: &str = "https://speed.cloudflare.com/__up";
const PING_HOST: &str = "1.1.1.1";

// A single TCP connection can only keep bandwidth×RTT bytes in flight before it
// stalls waiting for ACKs, so on a fast link one connection tops out well below
// line rate. The right number of parallel connections depends on the link and
// its latency — too few undershoots gigabit, too many wastes setup on a slow
// link. Instead of hardcoding a count we ramp connections up during warmup and
// stop once aggregate throughput stops climbing, auto-tuning to the link.
const MIN_CONNS: usize = 4;
const MAX_CONNS: usize = 32;
/// Connections added each ramp step while throughput is still climbing.
const RAMP_STEP: usize = 4;
/// How often the ramp controller samples aggregate throughput.
const RAMP_SAMPLE: Duration = Duration::from_millis(300);
/// Add another batch only if the latest sample's rate beats the previous by
/// more than this fraction; below it we treat the link as saturated.
const RAMP_GROWTH_THRESHOLD: f64 = 0.12;

/// Ramp-up period at the start of each phase. Bytes transferred during warmup
/// are discarded so TCP slow-start doesn't drag down the measured throughput,
/// and the connection ramp runs within this window so we hit the measurement
/// window already saturated.
const WARMUP: Duration = Duration::from_secs(3);
/// Measurement window, timed after warmup completes.
const WINDOW: Duration = Duration::from_secs(6);
/// Idle gap between phases so the link settles before the next measurement.
const SETTLE: Duration = Duration::from_secs(1);

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
        Self {
            raw: Arc::new(AtomicU64::new(0)),
            counted: Arc::new(AtomicU64::new(0)),
        }
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

/// Runs the connection ramp for one phase: starts `MIN_CONNS` workers, then
/// samples aggregate throughput on a fixed cadence and adds `RAMP_STEP` more
/// workers whenever the rate is still climbing, up to `MAX_CONNS`. Ramping only
/// happens during warmup; once the measurement window opens the connection set
/// is held steady. Returns the bytes transferred within the window.
///
/// `spawn_worker` launches one worker task that loops until the deadline,
/// feeding the shared `Counters`.
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

        // Only grow the pool while still warming up and still climbing.
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

/// One download connection: pulls the file back-to-back until the deadline,
/// feeding the shared counters. Starts on the primary endpoint and, on refusal,
/// advances to the next — so once Cloudflare 429s the worker settles on the
/// fallback instead of retrying a rate-limited origin every fetch.
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
            // A non-2xx (e.g. 429 Too Many Requests) or transport error means the
            // origin refused this request; its tiny error body must not be counted
            // as throughput. Advance to the next endpoint and back off briefly so
            // we neither hammer a rate-limited origin nor spin on it.
            _ => {
                url_index += 1;
                tokio::time::sleep(Duration::from_millis(250)).await;
                continue;
            }
        };
        let mut stream = response.bytes_stream();

        while let Ok(Some(chunk)) =
            tokio::time::timeout(Duration::from_secs(3), stream.next()).await
        {
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
    // Force HTTP/1.1: every worker requests the same host, and over HTTP/2
    // reqwest coalesces them onto one TCP connection as multiplexed streams that
    // then throttle each other via a shared flow-control window — collapsing the
    // measured rate. HTTP/1.1 can't multiplex, so each concurrent worker opens
    // its own TCP connection and we get real parallelism.
    let Ok(client) = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .http1_only()
        .build()
    else {
        eprintln!("Rove: could not build HTTP client for download test");
        return 0.0;
    };
    let start = Instant::now();
    let measure_start = start + WARMUP;
    let deadline = measure_start + WINDOW;
    let counters = Counters::new();

    let spawn = || {
        tokio::spawn(download_worker(
            client.clone(),
            measure_start,
            deadline,
            cancel.clone(),
            counters.clone(),
        ))
    };

    let bytes = adaptive_transfer(&counters, measure_start, deadline, cancel, spawn).await;
    mbps(bytes, start.elapsed().saturating_sub(WARMUP))
}

/// One connection's worth of upload. Rather than firing discrete POSTs and
/// counting only the ones that fully complete (which drops all in-flight bytes
/// and quantizes the result to whole requests), we open a single chunked POST
/// and feed its body on demand. The HTTP layer only pulls the next chunk once
/// the socket has room, so tallying bytes as they're pulled tracks the real
/// send rate via TCP backpressure. Bytes handed over during warmup fill the
/// send buffer but aren't counted, so the count reflects steady-state send.
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
    let Ok(client) = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
    else {
        eprintln!("Rove: could not build HTTP client for upload test");
        return 0.0;
    };

    // One shared random buffer, handed to the body stream as a cheap refcounted
    // clone. 64 KB keeps the byte count fine-grained on slow uplinks.
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
pub async fn run<F: Fn(SpeedTestProgress)>(
    link_capacity_mbps: Option<i64>,
    cancel: Arc<AtomicBool>,
    report: F,
) -> Result<SpeedTestResult, String> {
    let check = || {
        if cancel.load(Ordering::Relaxed) {
            Err(CANCELLED.to_string())
        } else {
            Ok(())
        }
    };

    report(SpeedTestProgress { phase: "internet".into(), message: "Testing download speed…".into(), progress: 15 });
    let download = measure_download(&cancel).await;
    check()?;

    tokio::time::sleep(SETTLE).await;
    check()?;

    report(SpeedTestProgress { phase: "internet".into(), message: "Testing upload speed…".into(), progress: 55 });
    let upload = measure_upload(&cancel).await;
    check()?;

    report(SpeedTestProgress { phase: "internet".into(), message: "Measuring latency…".into(), progress: 85 });
    let ping_stats = ping(PING_HOST, 10).await;
    check()?;

    let (latency, jitter, loss) = ping_stats
        .map(|p| (p.avg_ms, p.jitter_ms, p.packet_loss))
        .unwrap_or((9999.0, 9999.0, 100.0));

    let internet = SpeedResult {
        download_mbps: round1(download),
        upload_mbps: round1(upload),
        latency_ms: round1(latency),
        jitter_ms: round1(jitter),
        packet_loss: loss,
    };

    report(SpeedTestProgress { phase: "complete".into(), message: "Speed test complete".into(), progress: 100 });

    Ok(SpeedTestResult {
        capabilities: assess(&internet),
        internet,
        link_capacity_mbps,
    })
}
