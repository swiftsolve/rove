use crate::capabilities::assess;
use crate::diagnostics::ping;
use crate::types::{SpeedResult, SpeedTestProgress, SpeedTestResult};
use bytes::Bytes;
use futures_util::{stream, StreamExt};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

pub const CANCELLED: &str = "SPEED_TEST_CANCELLED";

// Sizes are chosen so a single connection can't drain the file within the
// measurement window (even on a gigabit link), which would otherwise force a
// reconnect and a fresh TCP slow-start in the middle of the measurement. We
// always stop at the deadline, so a large file transfers no more data than a
// small one — it just avoids the mid-window reconnect.
const DOWNLOAD_URLS: [&str; 3] = [
    "https://speed.cloudflare.com/__down?bytes=1000000000",
    "https://proof.ovh.net/files/1Gb.dat",
    "https://speed.hetzner.de/1GB.bin",
];
const UPLOAD_URL: &str = "https://speed.cloudflare.com/__up";
const PING_HOST: &str = "1.1.1.1";
const PARALLEL: usize = 3;
/// Ramp-up period at the start of each phase. Bytes transferred during warmup
/// are discarded so TCP slow-start doesn't drag down the measured throughput.
const WARMUP: Duration = Duration::from_secs(2);
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

async fn download_stream(
    client: &reqwest::Client,
    urls: &[&str],
    measure_start: Instant,
    deadline: Instant,
    cancel: &AtomicBool,
) -> u64 {
    let mut bytes = 0u64;
    let mut url_index = 0usize;

    while Instant::now() < deadline && !cancel.load(Ordering::Relaxed) {
        let url = urls[url_index % urls.len()];
        url_index += 1;

        let Ok(response) = client.get(url).send().await else {
            continue;
        };
        let mut stream = response.bytes_stream();

        while let Ok(Some(chunk)) =
            tokio::time::timeout(Duration::from_secs(3), stream.next()).await
        {
            let Ok(chunk) = chunk else { break };
            let now = Instant::now();
            // Only count bytes once the warmup period has elapsed.
            if now >= measure_start {
                bytes += chunk.len() as u64;
            }
            if now >= deadline || cancel.load(Ordering::Relaxed) {
                return bytes;
            }
        }
    }
    bytes
}

pub async fn measure_download(cancel: &AtomicBool) -> f64 {
    let Ok(client) = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
    else {
        eprintln!("Rove: could not build HTTP client for download test");
        return 0.0;
    };
    let start = Instant::now();
    let measure_start = start + WARMUP;
    let deadline = measure_start + WINDOW;

    let totals = futures_util::future::join_all(
        (0..PARALLEL).map(|_| download_stream(&client, &DOWNLOAD_URLS, measure_start, deadline, cancel)),
    )
    .await;

    mbps(totals.iter().sum(), start.elapsed().saturating_sub(WARMUP))
}

/// One connection's worth of upload. Rather than firing discrete POSTs and
/// counting only the ones that fully complete (which drops all in-flight bytes
/// and quantizes the result to whole requests), we open a single chunked POST
/// and feed its body on demand. The HTTP layer only pulls the next chunk once
/// the socket has room, so tallying bytes as they're pulled tracks the real
/// send rate via TCP backpressure. Bytes handed over during warmup fill the
/// send buffer but aren't counted, so the count reflects steady-state send.
async fn upload_stream(
    client: &reqwest::Client,
    payload: Bytes,
    measure_start: Instant,
    deadline: Instant,
    cancel: Arc<AtomicBool>,
    counted: Arc<AtomicU64>,
) {
    while Instant::now() < deadline && !cancel.load(Ordering::Relaxed) {
        let payload = payload.clone();
        let cancel = cancel.clone();
        let counted = counted.clone();
        let body = reqwest::Body::wrap_stream(stream::unfold((), move |()| {
            let payload = payload.clone();
            let cancel = cancel.clone();
            let counted = counted.clone();
            async move {
                let now = Instant::now();
                if now >= deadline || cancel.load(Ordering::Relaxed) {
                    return None;
                }
                if now >= measure_start {
                    counted.fetch_add(payload.len() as u64, Ordering::Relaxed);
                }
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
    let counted = Arc::new(AtomicU64::new(0));

    futures_util::future::join_all((0..PARALLEL).map(|_| {
        upload_stream(
            &client,
            payload.clone(),
            measure_start,
            deadline,
            cancel.clone(),
            counted.clone(),
        )
    }))
    .await;

    mbps(counted.load(Ordering::Relaxed), start.elapsed().saturating_sub(WARMUP))
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
