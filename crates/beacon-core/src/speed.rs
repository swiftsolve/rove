use crate::capabilities::assess;
use crate::diagnostics::ping;
use crate::types::{SpeedResult, SpeedTestProgress, SpeedTestResult};
use futures_util::StreamExt;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

pub const CANCELLED: &str = "SPEED_TEST_CANCELLED";

const DOWNLOAD_URLS: [&str; 4] = [
    "https://speed.cloudflare.com/__down?bytes=25000000",
    "https://proof.ovh.net/files/100Mb.dat",
    "https://proof.ovh.net/files/10Mb.dat",
    "https://speed.hetzner.de/100MB.bin",
];
const UPLOAD_URL: &str = "https://speed.cloudflare.com/__up";
const PING_HOST: &str = "1.1.1.1";
const PARALLEL: usize = 3;
const WINDOW: Duration = Duration::from_secs(6);

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
            bytes += chunk.len() as u64;
            if Instant::now() >= deadline || cancel.load(Ordering::Relaxed) {
                return bytes;
            }
        }
    }
    bytes
}

pub async fn measure_download(cancel: &AtomicBool) -> f64 {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .unwrap_or_default();
    let start = Instant::now();
    let deadline = start + WINDOW;

    let totals = futures_util::future::join_all(
        (0..PARALLEL).map(|_| download_stream(&client, &DOWNLOAD_URLS, deadline, cancel)),
    )
    .await;

    mbps(totals.iter().sum(), start.elapsed())
}

async fn upload_stream(client: &reqwest::Client, deadline: Instant, cancel: &AtomicBool) -> u64 {
    use rand::RngCore;
    let mut chunk = vec![0u8; 4 * 1024 * 1024];
    rand::thread_rng().fill_bytes(&mut chunk);

    let mut bytes = 0u64;
    while Instant::now() < deadline && !cancel.load(Ordering::Relaxed) {
        match client.post(UPLOAD_URL).body(chunk.clone()).send().await {
            Ok(_) => bytes += chunk.len() as u64,
            Err(_) => break,
        }
    }
    bytes
}

pub async fn measure_upload(cancel: &AtomicBool) -> f64 {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .unwrap_or_default();
    let start = Instant::now();
    let deadline = start + WINDOW;

    let totals = futures_util::future::join_all(
        (0..PARALLEL).map(|_| upload_stream(&client, deadline, cancel)),
    )
    .await;

    mbps(totals.iter().sum(), start.elapsed())
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

    tokio::time::sleep(Duration::from_millis(400)).await;
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
