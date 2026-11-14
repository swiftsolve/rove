//! The live download and upload rate, sampled once a second.
use serde::Serialize;
use sysinfo::Networks;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveThroughput {
    pub download_mbps: f64,
    pub upload_mbps: f64,
    pub timestamp: i64,
}

/// Weight of the newest reading in the moving average: smooths the chart
/// without lagging a real change by more than a few seconds.
const SMOOTH_ALPHA: f64 = 0.35;

/// 1 Hz sampler over the kernel's per-interface byte counters, via sysinfo so
/// it needs no per-OS code.
pub struct ThroughputSampler {
    networks: Networks,
    smoothed_down: f64,
    smoothed_up: f64,
    last_sample: Option<std::time::Instant>,
}

fn megabits(bytes: u64) -> f64 {
    bytes as f64 * 8.0 / 1_000_000.0
}

impl Default for ThroughputSampler {
    fn default() -> Self {
        Self::new()
    }
}

impl ThroughputSampler {
    pub fn new() -> Self {
        Self { networks: Networks::new_with_refreshed_list(), smoothed_down: 0.0, smoothed_up: 0.0, last_sample: None }
    }

    /// Reset the baseline without emitting a sample. Call it when the UI
    /// resubscribes after an idle gap, so the next `sample()` covers one real
    /// interval rather than reporting the whole gap as a spike.
    pub fn prime(&mut self) {
        self.networks.refresh(true);
        self.last_sample = Some(std::time::Instant::now());
    }

    /// The new moving average, rounded to 0.1 Mbps.
    fn smooth(previous: f64, next: f64) -> f64 {
        // From zero (first sample, or after idle) jump straight to the reading
        // rather than ramping up to it.
        let average = if previous <= 0.0 { next } else { previous * (1.0 - SMOOTH_ALPHA) + next * SMOOTH_ALPHA };
        (average * 10.0).round() / 10.0
    }

    /// Refresh the counters and return the smoothed rates. sysinfo's
    /// `received()`/`transmitted()` are deltas since the previous refresh, so
    /// they're divided by the real elapsed time, not an assumed second.
    pub fn sample(&mut self) -> LiveThroughput {
        self.networks.refresh(true);
        let now = std::time::Instant::now();
        let elapsed = self
            .last_sample
            .map(|t| now.duration_since(t).as_secs_f64())
            .unwrap_or(1.0)
            // Two samples close together would turn a few bytes into a huge rate.
            .max(0.25);
        self.last_sample = Some(now);

        let mut rx = 0u64;
        let mut tx = 0u64;
        for (name, data) in self.networks.iter() {
            if crate::utils::net::is_virtual_interface(name) {
                continue;
            }
            rx += data.received();
            tx += data.transmitted();
        }

        let raw_down = megabits(rx) / elapsed;
        let raw_up = megabits(tx) / elapsed;
        self.smoothed_down = Self::smooth(self.smoothed_down, raw_down);
        self.smoothed_up = Self::smooth(self.smoothed_up, raw_up);

        LiveThroughput {
            download_mbps: self.smoothed_down,
            upload_mbps: self.smoothed_up,
            timestamp: crate::utils::net::now_ms(),
        }
    }
}
