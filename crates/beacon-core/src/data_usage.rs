use crate::types::{DailyUsage, DataUsageSummary};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const RETAIN_DAYS: usize = 30;
const SUMMARY_DAYS: i64 = 7;

/// Local calendar date key ("2026-07-03") for a day `offset` days from today.
fn date_key(offset_days: i64) -> String {
    // Days since epoch in local time via libc-free approximation: use chrono-less
    // arithmetic on the local offset obtained from the `date` of the system clock.
    // We format through time crate-free logic: read from std::process is overkill;
    // derive from SystemTime UTC and the TZ offset captured at startup.
    local_date_key(offset_days)
}

// Minimal local-date support without pulling chrono: compute using the
// captured local-UTC offset (seconds). Good enough for day bucketing.
static LOCAL_OFFSET_SECS: std::sync::OnceLock<i64> = std::sync::OnceLock::new();

fn local_offset_secs() -> i64 {
    *LOCAL_OFFSET_SECS.get_or_init(|| {
        // `date +%z` → "+0500" / "-0400"; works on Linux & macOS. Windows: 0 (UTC bucketing).
        if cfg!(target_os = "windows") {
            return 0;
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
    })
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

#[derive(Serialize, Deserialize, Default, Clone, Copy)]
struct DayBucket {
    rx: u64,
    tx: u64,
}

#[derive(Serialize, Deserialize, Default)]
struct Persisted {
    days: HashMap<String, DayBucket>,
    first_sample_at: Option<u64>,
}

pub struct UsageTracker {
    store_path: PathBuf,
    data: Persisted,
    last_bytes: HashMap<String, DayBucket>,
}

impl UsageTracker {
    pub fn new(store_path: PathBuf) -> Self {
        let data = std::fs::read_to_string(&store_path)
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default();
        Self { store_path, data, last_bytes: HashMap::new() }
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
                rx_delta += if rx >= last.rx { rx - last.rx } else { rx };
                tx_delta += if tx >= last.tx { tx - last.tx } else { tx };
            }
            self.last_bytes.insert(name.clone(), DayBucket { rx, tx });
        }

        if self.data.first_sample_at.is_none() {
            self.data.first_sample_at = Some(crate::net_util::now_ms());
        }
        if rx_delta == 0 && tx_delta == 0 {
            return;
        }

        let key = local_date_key(0);
        let bucket = self.data.days.entry(key).or_default();
        bucket.rx += rx_delta;
        bucket.tx += tx_delta;

        self.prune();
        self.persist();
    }

    fn prune(&mut self) {
        if self.data.days.len() <= RETAIN_DAYS {
            return;
        }
        let mut keys: Vec<String> = self.data.days.keys().cloned().collect();
        keys.sort();
        for key in keys.into_iter().take(self.data.days.len() - RETAIN_DAYS) {
            self.data.days.remove(&key);
        }
    }

    fn persist(&self) {
        if let Ok(json) = serde_json::to_string(&self.data) {
            let _ = std::fs::write(&self.store_path, json);
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
                let key = date_key(offset);
                let bucket = self.data.days.get(&key).copied().unwrap_or_default();
                DailyUsage { date: key, rx_bytes: bucket.rx, tx_bytes: bucket.tx }
            })
            .collect();

        let (boot_rx, boot_tx) = Self::boot_totals(networks);

        DataUsageSummary {
            days,
            boot_rx_bytes: boot_rx,
            boot_tx_bytes: boot_tx,
            tracking_since: self.data.first_sample_at,
        }
    }
}
