use crate::store::Store;
use crate::usage::ByteCounts;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyUsage {
    pub date: String,
    pub rx_bytes: u64,
    pub tx_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataUsageSummary {
    pub days: Vec<DailyUsage>,
    pub boot_rx_bytes: u64,
    pub boot_tx_bytes: u64,
    pub tracking_since: Option<u64>,
}

/// Daily buckets kept in the store; older days are pruned on each write.
const RETAIN_DAYS: usize = 30;
/// Days the summary reports, today included.
const SUMMARY_DAYS: i64 = 7;

const SECS_PER_DAY: i64 = 86_400;

/// `meta` key holding the epoch-ms of the first-ever usage sample.
const FIRST_SAMPLE_KEY: &str = "usage_first_sample_at";

// Local dates without chrono: add the UTC offset to the UNIX clock and bucket
// by day. The offset is re-derived hourly so a DST change or a new timezone
// moves the day boundary within the hour.
static LOCAL_OFFSET: std::sync::Mutex<Option<(i64, u64)>> = std::sync::Mutex::new(None);
const OFFSET_TTL_SECS: u64 = 3600;

fn local_offset_secs() -> i64 {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let mut cached = crate::util::net::lock(&LOCAL_OFFSET);
    if let Some((offset, computed_at)) = *cached {
        if now.saturating_sub(computed_at) < OFFSET_TTL_SECS {
            return offset;
        }
    }
    let offset = compute_local_offset_secs();
    *cached = Some((offset, now));
    offset
}

fn compute_local_offset_secs() -> i64 {
    if cfg!(target_os = "windows") {
        return crate::platform::windows::utc_offset_secs().unwrap_or(0);
    }
    std::process::Command::new("date")
        .arg("+%z")
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| {
            let s = s.trim();
            let sign = if s.starts_with('-') { -1 } else { 1 };
            let h: i64 = s.get(1..3)?.parse().ok()?;
            let m: i64 = s.get(3..5)?.parse().ok()?;
            Some(sign * (h * 3600 + m * 60))
        })
        .unwrap_or(0)
}

pub fn local_date_key(offset_days: i64) -> String {
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
        + local_offset_secs()
        + offset_days * SECS_PER_DAY;
    let days = secs.div_euclid(SECS_PER_DAY);
    civil_from_days(days)
}

/// Howard Hinnant's civil-from-days algorithm.
fn civil_from_days(z: i64) -> String {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}")
}

/// Turns per-interface cumulative counters into daily deltas, persisted each
/// tick to the shared [`Store`]. Only `last_bytes`, the previous reading to diff
/// against, lives in memory.
pub struct UsageTracker {
    store: Arc<Store>,
    last_bytes: HashMap<String, ByteCounts>,
    first_sample_recorded: bool,
}

impl UsageTracker {
    pub fn new(store: Arc<Store>) -> Self {
        let first_sample_recorded = store.get_meta_u64(FIRST_SAMPLE_KEY).ok().flatten().is_some();
        Self { store, last_bytes: HashMap::new(), first_sample_recorded }
    }

    /// One 30 s tick: add the per-interface deltas to today's bucket.
    pub fn sample(&mut self, networks: &sysinfo::Networks) {
        let mut rx_delta = 0u64;
        let mut tx_delta = 0u64;

        for (name, data) in networks.iter() {
            if crate::util::net::is_virtual_interface(name) {
                continue;
            }
            let rx = data.total_received();
            let tx = data.total_transmitted();
            if let Some(last) = self.last_bytes.get(name) {
                // A counter that went down (reboot, driver reload, re-enumeration)
                // credits nothing: crediting the new reading in full would dump a
                // phantom multi-GB spike into today's bucket.
                rx_delta += rx.saturating_sub(last.rx);
                tx_delta += tx.saturating_sub(last.tx);
            }
            self.last_bytes.insert(name.clone(), ByteCounts { rx, tx });
        }
        // Forget interfaces that disappeared (Docker/VPN churn) so `last_bytes`
        // stays bounded over a long session.
        self.last_bytes.retain(|name, _| networks.contains_key(name) && !crate::util::net::is_virtual_interface(name));

        if !self.first_sample_recorded {
            if let Err(e) = self.store.set_meta_u64(FIRST_SAMPLE_KEY, crate::util::net::now_ms()) {
                tracing::warn!("failed to record first-sample timestamp: {e}");
            }
            self.first_sample_recorded = true;
        }
        if rx_delta == 0 && tx_delta == 0 {
            return;
        }

        let key = local_date_key(0);
        if let Err(e) = self.store.add_usage(&key, rx_delta, tx_delta) {
            tracing::error!("failed to persist data usage for {key}: {e}");
        }
        if let Err(e) = self.store.prune_usage(RETAIN_DAYS) {
            tracing::warn!("failed to prune old usage rows: {e}");
        }
    }

    /// Kernel-cumulative totals since boot across physical interfaces.
    fn boot_totals(networks: &sysinfo::Networks) -> (u64, u64) {
        // /sys is authoritative on Linux; sysinfo totals elsewhere.
        if cfg!(target_os = "linux") {
            if let Some(totals) = crate::platform::linux::boot_totals() {
                return totals;
            }
        }
        let mut rx = 0u64;
        let mut tx = 0u64;
        for (name, data) in networks.iter() {
            if crate::util::net::is_virtual_interface(name) {
                continue;
            }
            rx += data.total_received();
            tx += data.total_transmitted();
        }
        (rx, tx)
    }

    pub fn summary(&self, networks: &sysinfo::Networks) -> DataUsageSummary {
        let days = (1 - SUMMARY_DAYS..=0)
            .map(|offset| {
                let key = local_date_key(offset);
                let (rx, tx) = self.store.usage_day(&key).unwrap_or((0, 0));
                DailyUsage { date: key, rx_bytes: rx, tx_bytes: tx }
            })
            .collect();

        let (boot_rx, boot_tx) = Self::boot_totals(networks);

        DataUsageSummary {
            days,
            boot_rx_bytes: boot_rx,
            boot_tx_bytes: boot_tx,
            tracking_since: self.store.get_meta_u64(FIRST_SAMPLE_KEY).ok().flatten(),
        }
    }
}
