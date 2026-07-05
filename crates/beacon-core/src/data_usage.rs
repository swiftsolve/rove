use crate::store::Store;
use crate::types::{DailyUsage, DataUsageSummary};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

const RETAIN_DAYS: usize = 30;
const SUMMARY_DAYS: i64 = 7;

/// `meta` key holding the epoch-ms of the first-ever usage sample.
const FIRST_SAMPLE_KEY: &str = "usage_first_sample_at";

// Local dates without pulling in chrono: apply the local-UTC offset to the
// UNIX clock, then bucket by day. The offset is cached but re-derived at most
// hourly so a machine that crosses a DST boundary (or changes timezone) while
// running starts bucketing into the correct day within the hour.
static LOCAL_OFFSET: std::sync::Mutex<Option<(i64, u64)>> = std::sync::Mutex::new(None);
const OFFSET_TTL_SECS: u64 = 3600;

fn local_offset_secs() -> i64 {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let mut cached = LOCAL_OFFSET.lock().unwrap_or_else(|e| e.into_inner());
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
    // Windows: minutes from UTC via PowerShell; Unix: `date +%z`.
    if cfg!(target_os = "windows") {
        return std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", "(Get-TimeZone).BaseUtcOffset.TotalMinutes"])
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .and_then(|s| s.trim().parse::<f64>().ok())
            .map(|minutes| (minutes * 60.0) as i64)
            .unwrap_or(0);
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
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
        + local_offset_secs()
        + offset_days * 86_400;
    let days = secs.div_euclid(86_400);
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

#[derive(Default, Clone, Copy)]
struct ByteCounts {
    rx: u64,
    tx: u64,
}

/// Turns per-interface cumulative counters into daily deltas, persisting each
/// tick into the shared [`Store`]. The only in-memory state is `last_bytes`,
/// the previous reading needed to compute a delta; everything durable lives in
/// the database.
pub struct UsageTracker {
    store: Arc<Store>,
    last_bytes: HashMap<String, ByteCounts>,
    first_sample_recorded: bool,
}

impl UsageTracker {
    pub fn new(store: Arc<Store>) -> Self {
        let first_sample_recorded = store
            .get_meta_u64(FIRST_SAMPLE_KEY)
            .ok()
            .flatten()
            .is_some();
        Self { store, last_bytes: HashMap::new(), first_sample_recorded }
    }

    /// One 30s tick: accumulate per-interface deltas into today's bucket.
    pub fn sample(&mut self, networks: &sysinfo::Networks) {
        let mut rx_delta = 0u64;
        let mut tx_delta = 0u64;

        for (name, data) in networks.iter() {
            if crate::net_util::is_virtual_interface(name) {
                continue;
            }
            let rx = data.total_received();
            let tx = data.total_transmitted();
            if let Some(last) = self.last_bytes.get(name) {
                // On a counter decrease (reboot, driver reload, re-enumeration)
                // credit nothing rather than the full new reading — the latter
                // would dump a phantom multi-GB spike into today's bucket.
                rx_delta += rx.saturating_sub(last.rx);
                tx_delta += tx.saturating_sub(last.tx);
            }
            self.last_bytes.insert(name.clone(), ByteCounts { rx, tx });
        }
        // Drop counters for interfaces that disappeared (Docker/VPN churn) so
        // `last_bytes` doesn't grow without bound across a long session.
        self.last_bytes
            .retain(|name, _| networks.contains_key(name) && !crate::net_util::is_virtual_interface(name));

        if !self.first_sample_recorded {
            if let Err(e) = self.store.set_meta_u64(FIRST_SAMPLE_KEY, crate::net_util::now_ms()) {
                eprintln!("Beacon: failed to record first-sample timestamp: {e}");
            }
            self.first_sample_recorded = true;
        }
        if rx_delta == 0 && tx_delta == 0 {
            return;
        }

        let key = local_date_key(0);
        if let Err(e) = self.store.add_usage(&key, rx_delta, tx_delta) {
            eprintln!("Beacon: failed to persist data usage for {key}: {e}");
        }
        if let Err(e) = self.store.prune_usage(RETAIN_DAYS) {
            eprintln!("Beacon: failed to prune old usage rows: {e}");
        }
    }

    /// Kernel-cumulative totals since boot across physical interfaces.
    fn boot_totals(networks: &sysinfo::Networks) -> (u64, u64) {
        // /sys is authoritative on Linux; sysinfo totals elsewhere.
        if cfg!(target_os = "linux") {
            let mut rx = 0u64;
            let mut tx = 0u64;
            if let Ok(entries) = std::fs::read_dir("/sys/class/net") {
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().into_owned();
                    if crate::net_util::is_virtual_interface(&name) {
                        continue;
                    }
                    let read = |file: &str| -> u64 {
                        std::fs::read_to_string(entry.path().join("statistics").join(file))
                            .ok()
                            .and_then(|raw| raw.trim().parse().ok())
                            .unwrap_or(0)
                    };
                    rx += read("rx_bytes");
                    tx += read("tx_bytes");
                }
                return (rx, tx);
            }
        }
        let mut rx = 0u64;
        let mut tx = 0u64;
        for (name, data) in networks.iter() {
            if crate::net_util::is_virtual_interface(name) {
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
