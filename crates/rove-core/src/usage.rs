//! Data usage: per-interface daily totals in the store, and the bytes since boot.
use crate::store::Store;
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
    pub tracking_since: Option<i64>,
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
    let mut cached = crate::utils::net::lock(&LOCAL_OFFSET);
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
    let secs = crate::utils::net::now_ms() / 1000 + local_offset_secs() + offset_days * SECS_PER_DAY;
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
        let first_sample_recorded = store.get_meta_i64(FIRST_SAMPLE_KEY).ok().flatten().is_some();
        Self { store, last_bytes: HashMap::new(), first_sample_recorded }
    }

    /// One 30 s tick: add the per-interface deltas to today's bucket.
    pub fn sample(&mut self, networks: &sysinfo::Networks) {
        let readings = physical_readings(networks);
        let ByteCounts { rx: rx_delta, tx: tx_delta } = rise_since(&self.last_bytes, &readings);
        for (name, counts) in readings {
            self.last_bytes.insert(name, counts);
        }
        // Forget interfaces that disappeared (Docker/VPN churn) so `last_bytes`
        // stays bounded over a long session.
        self.last_bytes.retain(|name, _| networks.contains_key(name) && !crate::utils::net::is_virtual_interface(name));

        if !self.first_sample_recorded {
            if let Err(e) = self.store.set_meta_i64(FIRST_SAMPLE_KEY, crate::utils::net::now_ms()) {
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
            if crate::utils::net::is_virtual_interface(name) {
                continue;
            }
            rx += data.total_received();
            tx += data.total_transmitted();
        }
        (rx, tx)
    }

    pub fn summary(&self, networks: &sysinfo::Networks) -> DataUsageSummary {
        // Today also counts what's moved since the last tick, so it climbs as
        // the view polls rather than in 30 s steps. Read, not saved: the next
        // tick saves the same rise.
        let unsaved = rise_since(&self.last_bytes, &physical_readings(networks));
        let days = (1 - SUMMARY_DAYS..=0)
            .map(|offset| {
                let key = local_date_key(offset);
                let (rx, tx) = self.store.usage_day(&key).unwrap_or((0, 0));
                let (rx, tx) = if offset == 0 { (rx + unsaved.rx, tx + unsaved.tx) } else { (rx, tx) };
                DailyUsage { date: key, rx_bytes: rx, tx_bytes: tx }
            })
            .collect();

        let (boot_rx, boot_tx) = Self::boot_totals(networks);

        DataUsageSummary {
            days,
            boot_rx_bytes: boot_rx,
            boot_tx_bytes: boot_tx,
            tracking_since: self.store.get_meta_i64(FIRST_SAMPLE_KEY).ok().flatten(),
        }
    }
}

/// Each physical interface's cumulative counters, by name.
fn physical_readings(networks: &sysinfo::Networks) -> Vec<(String, ByteCounts)> {
    networks
        .iter()
        .filter(|(name, _)| !crate::utils::net::is_virtual_interface(name))
        .map(|(name, data)| (name.clone(), ByteCounts { rx: data.total_received(), tx: data.total_transmitted() }))
        .collect()
}

/// How far `readings` have risen past `last`, summed. An interface with no
/// last reading credits nothing yet, and a counter that went down (reboot,
/// driver reload, re-enumeration) credits nothing: crediting the new reading
/// in full would dump a phantom multi-GB spike into today's bucket.
fn rise_since(last: &HashMap<String, ByteCounts>, readings: &[(String, ByteCounts)]) -> ByteCounts {
    let mut rise = ByteCounts::default();
    for (name, now) in readings {
        if let Some(before) = last.get(name) {
            rise.rx += now.rx.saturating_sub(before.rx);
            rise.tx += now.tx.saturating_sub(before.tx);
        }
    }
    rise
}

/// A received/sent byte pair: a counter reading or a running total.
#[derive(Default, Clone, Copy)]
pub(crate) struct ByteCounts {
    pub(crate) rx: u64,
    pub(crate) tx: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reading(name: &str, rx: u64, tx: u64) -> (String, ByteCounts) {
        (name.to_string(), ByteCounts { rx, tx })
    }

    #[test]
    fn rise_since_sums_each_interfaces_climb() {
        let last = HashMap::from([reading("en0", 100, 10), reading("en1", 50, 5)]);
        let rise = rise_since(&last, &[reading("en0", 160, 15), reading("en1", 70, 5)]);
        assert_eq!((rise.rx, rise.tx), (80, 5));
    }

    #[test]
    fn rise_since_credits_nothing_for_a_new_or_reset_counter() {
        let last = HashMap::from([reading("en0", 1_000, 1_000)]);
        let rise = rise_since(&last, &[reading("en0", 20, 30), reading("en5", 900, 900)]);
        assert_eq!((rise.rx, rise.tx), (0, 0));
    }
}
