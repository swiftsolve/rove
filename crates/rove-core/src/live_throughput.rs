use crate::types::LiveThroughput;
use std::time::{SystemTime, UNIX_EPOCH};
use sysinfo::Networks;

const SMOOTH_ALPHA: f64 = 0.35;

/// Stateful 1 Hz sampler over kernel counters (sysinfo is cross-platform).
pub struct ThroughputSampler {
    networks: Networks,
    smoothed_down: f64,
    smoothed_up: f64,
    last_sample: Option<std::time::Instant>,
}

impl Default for ThroughputSampler {
    fn default() -> Self {
        Self::new()
    }
}

impl ThroughputSampler {
    pub fn new() -> Self {
        Self {
            networks: Networks::new_with_refreshed_list(),
            smoothed_down: 0.0,
            smoothed_up: 0.0,
            last_sample: None,
        }
    }

    /// Reset the timing/counter baseline without emitting a sample. Call this
    /// when the UI (re)subscribes after an idle gap: it discards the bytes that
    /// accumulated while nobody was listening, so the next `sample()` reflects
    /// one real interval instead of reporting the whole gap as a false spike.
    pub fn prime(&mut self) {
        self.networks.refresh(true);
        self.last_sample = Some(std::time::Instant::now());
    }

    fn smooth(previous: f64, next: f64) -> f64 {
        if previous <= 0.0 {
            (next * 10.0).round() / 10.0
        } else {
            ((previous * (1.0 - SMOOTH_ALPHA) + next * SMOOTH_ALPHA) * 10.0).round() / 10.0
        }
    }

    /// Refresh counters and return the current smoothed rates. sysinfo's
    /// received()/transmitted() are the deltas since the previous refresh.
    pub fn sample(&mut self) -> LiveThroughput {
        self.networks.refresh(true);
        let now = std::time::Instant::now();
        let elapsed = self
            .last_sample
            .map(|t| now.duration_since(t).as_secs_f64())
            .unwrap_or(1.0)
            .max(0.25);
        self.last_sample = Some(now);

        let mut rx = 0u64;
        let mut tx = 0u64;
        for (name, data) in self.networks.iter() {
            if crate::net_util::is_virtual_interface(name) {
                continue;
            }
            rx += data.received();
            tx += data.transmitted();
        }

        let raw_down = rx as f64 * 8.0 / 1_000_000.0 / elapsed;
        let raw_up = tx as f64 * 8.0 / 1_000_000.0 / elapsed;
        self.smoothed_down = Self::smooth(self.smoothed_down, raw_down);
        self.smoothed_up = Self::smooth(self.smoothed_up, raw_up);

        LiveThroughput {
            download_mbps: self.smoothed_down,
            upload_mbps: self.smoothed_up,
            timestamp: SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0),
        }
    }
}
