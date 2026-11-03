//! The roster of LAN devices seen across scans, and the feed events a scan
//! diff derives from it: joins, departures, returns and gateway changes.
use super::events::{
    is_connected_identity, EVENT_AP_APPEARED, EVENT_DEVICE_JOINED, EVENT_DEVICE_OFFLINE, EVENT_DEVICE_ONLINE,
    EVENT_GATEWAY_CHANGED, EVENT_INITIAL_SCAN, META_CONNECTION_IDENTITY,
};
use super::Store;
use crate::devices::LanDevice;
use rusqlite::{params, Connection, Row};
use serde::Serialize;
use std::collections::{HashMap, HashSet};

/// A LAN device as remembered across scans, with first/last-seen timestamps.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnownDevice {
    pub mac: String,
    pub ip: Option<String>,
    pub hostname: Option<String>,
    pub vendor: Option<String>,
    /// OS family from the DHCP fingerprint ("Android", "Apple"), kept so a
    /// departed device with no hostname or vendor still reads "Android device"
    /// in the feed (see `known_name`).
    pub os: Option<String>,
    pub kind: String,
    /// Whether the MAC is privacy-randomized. Kept because a departure only has
    /// this row: without it a randomized phone joins as "Private device" but
    /// leaves as "Unknown device".
    pub randomized: bool,
    pub first_seen: i64,
    pub last_seen: i64,
}

/// A device only goes "offline" if it was seen this recently before a scan
/// missed it. Anything older is history, not a drop, which keeps a scan after a
/// long gap from marking everything offline.
const OFFLINE_RECENCY_MS: i64 = 15 * 60 * 1000;

/// How long an offline device stays in the Devices list after it last answered:
/// long enough to cover a phone asleep overnight, short enough that one gone for
/// good clears on its own. Its roster row stays in the database.
pub const OFFLINE_LIST_KEEP_MS: i64 = 24 * 60 * 60 * 1000;

/// `meta` key for the gateway's MAC as last seen, the baseline
/// `detect_gateway_change` diffs against.
const META_GATEWAY_MAC: &str = "gateway_mac";

/// The `known_devices` columns in the order `known_device_from_row` reads them.
const KNOWN_DEVICE_COLUMNS: &str = "mac, ip, hostname, vendor, kind, first_seen, last_seen, os, randomized";

fn known_device_from_row(row: &Row) -> rusqlite::Result<KnownDevice> {
    Ok(KnownDevice {
        mac: row.get(0)?,
        ip: row.get(1)?,
        hostname: row.get(2)?,
        vendor: row.get(3)?,
        kind: row.get(4)?,
        first_seen: row.get(5)?,
        last_seen: row.get(6)?,
        os: row.get(7)?,
        randomized: row.get(8)?,
    })
}

/// Whether the newest event for `mac` is its departure, so it reads offline
/// until it returns.
fn is_marked_offline(last_event: &HashMap<String, String>, mac: &str) -> bool {
    last_event.get(mac).map(String::as_str) == Some(EVENT_DEVICE_OFFLINE)
}

impl Store {
    /// Upsert one device row. A field this scan lacks keeps its earlier value,
    /// `kind` included: a phone asleep in power-save answers nothing and reads
    /// back `unknown`, and must not collapse from "phone" to "Generic device".
    /// Any known kind still replaces the old one.
    fn upsert_device(conn: &Connection, device: &LanDevice, now_ms: i64) -> rusqlite::Result<()> {
        conn.execute(
            "INSERT INTO known_devices
                (mac, ip, hostname, vendor, os, kind, randomized, first_seen, last_seen)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
             ON CONFLICT(mac) DO UPDATE SET
                ip         = excluded.ip,
                hostname   = COALESCE(excluded.hostname, known_devices.hostname),
                vendor     = COALESCE(excluded.vendor, known_devices.vendor),
                os         = COALESCE(excluded.os, known_devices.os),
                kind       = CASE WHEN excluded.kind = 'unknown'
                                  THEN known_devices.kind ELSE excluded.kind END,
                randomized = excluded.randomized,
                last_seen  = excluded.last_seen",
            params![
                device.mac,
                device.ip,
                device.hostname,
                device.vendor,
                device.os,
                device.kind,
                device.is_randomized_mac,
                now_ms,
            ],
        )?;
        Ok(())
    }

    /// Bump only `ip` and `last_seen` of an existing row. For the passive
    /// refresh, whose thin evidence must never overwrite a better identity.
    fn bump_last_seen(conn: &Connection, mac: &str, ip: &str, now_ms: i64) -> rusqlite::Result<()> {
        conn.execute("UPDATE known_devices SET ip = ?2, last_seen = ?3 WHERE mac = ?1", params![mac, ip, now_ms])?;
        Ok(())
    }

    /// Record the devices [`crate::devices::passive_refresh`] confirmed present.
    /// Unlike [`Self::record_devices`] it asserts **no** departures: passive
    /// discovery can't prove a device is gone. It only moves forward: bumping
    /// `last_seen`, logging a new MAC as an arrival, and flagging an offline
    /// device as back online.
    ///
    /// A no-op until an active scan has seeded the roster: seeding from the few
    /// hosts that announce themselves would make that first full scan report
    /// every silent device as an arrival.
    pub fn touch_devices(&self, present: &[LanDevice], now_ms: i64) -> rusqlite::Result<()> {
        let mut conn = self.lock();
        let prior = Self::load_known_map(&conn)?;
        if prior.is_empty() {
            return Ok(());
        }
        let tx = conn.transaction()?;
        let last_event = Self::load_last_event_types(&tx)?;

        for device in present.iter().filter(|d| !d.mac.is_empty() && d.is_reachable) {
            match prior.get(&device.mac) {
                None => {
                    // Store its thin identity so the arrival isn't blank; the
                    // next active scan enriches it.
                    Self::emit_new_device(&tx, device, now_ms)?;
                    Self::upsert_device(&tx, device, now_ms)?;
                }
                Some(_) => {
                    // Mirror `record_devices`' online transition, so a device
                    // returning while the window is hidden still lands on the feed.
                    if is_marked_offline(&last_event, &device.mac) {
                        Self::record_event(&tx, now_ms, EVENT_DEVICE_ONLINE, "info", device, None, None)?;
                    }
                    Self::bump_last_seen(&tx, &device.mac, &device.ip, now_ms)?;
                }
            }
        }

        Self::prune_events(&tx, now_ms)?;
        tx.commit()?;
        Ok(())
    }

    /// Upsert a scan's devices and log what it implies (arrivals, departures,
    /// returns, a gateway change), diffing against the roster before it's
    /// overwritten.
    pub fn record_devices(&self, devices: &[LanDevice], now_ms: i64) -> rusqlite::Result<()> {
        let mut conn = self.lock();
        let tx = conn.transaction()?;

        // Captured before any upsert overwrites it.
        let prior = Self::load_known_map(&tx)?;
        // Most-recent event per MAC, so a departed device stays a single
        // "offline" row until it returns.
        let last_event = Self::load_last_event_types(&tx)?;
        // An empty roster makes this scan a baseline, not a wall of "joined" rows.
        let is_roster_empty = prior.is_empty();
        // The first scan to write to the feed summarises the roster as one
        // "N devices discovered" row and skips the per-device diff this once,
        // rather than leaving the page blank or bursting events at an existing
        // user upgrading into the feature.
        let is_seeding_feed = !Self::is_feed_seeded(&tx)?;

        // Present only if it answered this scan. One still in the ARP table but
        // failing liveness reads "Offline" in the Devices view, so it's gone here
        // too; otherwise the feed would lag until the OS ages the entry out (~20
        // min). The debounce in `devices/liveness.rs` holds a device reachable
        // across a brief sleep or a burst of scans seconds apart, so this doesn't
        // flap.
        let live: HashSet<&str> =
            devices.iter().filter(|d| !d.mac.is_empty() && d.is_reachable).map(|d| d.mac.as_str()).collect();

        for device in devices.iter().filter(|d| !d.mac.is_empty()) {
            if !is_seeding_feed {
                match prior.get(&device.mac) {
                    None => {
                        if !is_roster_empty {
                            Self::emit_new_device(&tx, device, now_ms)?;
                        }
                    }
                    Some(_) => {
                        // Gate on `is_reachable` so a device back in the ARP
                        // table but not answering doesn't read as reconnected.
                        if device.is_reachable && is_marked_offline(&last_event, &device.mac) {
                            Self::record_event(&tx, now_ms, EVENT_DEVICE_ONLINE, "info", device, None, None)?;
                        }
                        // Identity changes (hostname, IP, vendor, kind) aren't
                        // logged: they proved too noisy.
                    }
                }
            }
            Self::upsert_device(&tx, device, now_ms)?;
        }

        // This machine's link as `record_connection` last saw it. Off-network,
        // every peer stops answering at once; that's our link dropping, not the
        // LAN emptying. Never polled reads as connected, so real departures
        // aren't suppressed.
        let host_connected = Self::read_meta(&tx, META_CONNECTION_IDENTITY)?
            .map(|identity| is_connected_identity(&identity))
            .unwrap_or(true);

        // Departures: recently seen devices that didn't answer this scan, unless
        // already marked offline. Two conditions suppress the whole burst, both
        // meaning this machine dropped off:
        //   * An empty `live` set: not even self or the gateway answered, so the
        //     scan failed.
        //   * The host is disconnected: on macOS a downed link still lists self
        //     as reachable, so `live` isn't empty; the stored identity catches it.
        // The one `connection_lost` from `record_connection` stands in instead.
        if !is_seeding_feed && !live.is_empty() && host_connected {
            for (mac, prev) in &prior {
                if live.contains(mac.as_str()) {
                    continue;
                }
                if now_ms - prev.last_seen > OFFLINE_RECENCY_MS {
                    continue;
                }
                if is_marked_offline(&last_event, mac) {
                    continue;
                }
                Self::insert_event(
                    &tx,
                    now_ms,
                    EVENT_DEVICE_OFFLINE,
                    "info",
                    Some(mac),
                    prev.ip.as_deref(),
                    Self::known_name(prev).as_deref(),
                    None,
                    None,
                    prev.randomized,
                )?;
            }
        }

        // A gateway MAC changing under us is the classic rogue-gateway or
        // ARP-spoof signal. With no stored baseline it only records one.
        Self::detect_gateway_change(&tx, devices, now_ms)?;

        if is_seeding_feed {
            let count = devices.iter().filter(|d| !d.mac.is_empty()).count();
            if count > 0 {
                Self::insert_event(
                    &tx,
                    now_ms,
                    EVENT_INITIAL_SCAN,
                    "info",
                    None,
                    None,
                    None,
                    None,
                    Some(&count.to_string()),
                    false,
                )?;
                Self::mark_feed_seeded(&tx)?;
            }
        }

        Self::prune_events(&tx, now_ms)?;
        tx.commit()?;
        Ok(())
    }

    /// The roster keyed by MAC: a scan's diff baseline.
    fn load_known_map(conn: &Connection) -> rusqlite::Result<HashMap<String, KnownDevice>> {
        let mut stmt = conn.prepare(&format!("SELECT {KNOWN_DEVICE_COLUMNS} FROM known_devices"))?;
        let rows = stmt.query_map([], known_device_from_row)?;
        let mut map = HashMap::new();
        for row in rows {
            let device = row?;
            map.insert(device.mac.clone(), device);
        }
        Ok(map)
    }

    /// The newest event `type` per MAC.
    fn load_last_event_types(conn: &Connection) -> rusqlite::Result<HashMap<String, String>> {
        let mut stmt = conn.prepare(
            "SELECT mac, type FROM network_events WHERE id IN
                (SELECT MAX(id) FROM network_events WHERE mac IS NOT NULL GROUP BY mac)",
        )?;
        let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?;
        let mut map = HashMap::new();
        for row in rows {
            let (mac, event_type) = row?;
            map.insert(mac, event_type);
        }
        Ok(map)
    }

    /// A router that isn't our gateway is a new AP or mesh node, a
    /// higher-signal security event; anything else is a plain arrival.
    fn emit_new_device(conn: &Connection, device: &LanDevice, ts: i64) -> rusqlite::Result<()> {
        let (event_type, severity) = if device.kind == "router" && !device.is_gateway {
            (EVENT_AP_APPEARED, "warning")
        } else {
            (EVENT_DEVICE_JOINED, "info")
        };
        Self::record_event(conn, ts, event_type, severity, device, None, None)
    }

    fn detect_gateway_change(conn: &Connection, devices: &[LanDevice], ts: i64) -> rusqlite::Result<()> {
        let Some(gateway) = devices.iter().find(|d| d.is_gateway && !d.mac.is_empty()) else {
            return Ok(());
        };
        let prev = Self::read_meta(conn, META_GATEWAY_MAC)?;
        if let Some(old) = prev.as_deref() {
            if old != gateway.mac {
                Self::record_event(
                    conn,
                    ts,
                    EVENT_GATEWAY_CHANGED,
                    "critical",
                    gateway,
                    Some(old),
                    Some(&gateway.mac),
                )?;
            }
        }
        Self::write_meta(conn, META_GATEWAY_MAC, &gateway.mac)
    }

    /// Every device we've ever recorded, most-recently-seen first.
    pub fn known_devices(&self) -> rusqlite::Result<Vec<KnownDevice>> {
        let conn = self.lock();
        let mut stmt =
            conn.prepare(&format!("SELECT {KNOWN_DEVICE_COLUMNS} FROM known_devices ORDER BY last_seen DESC"))?;
        let rows = stmt.query_map([], known_device_from_row)?;
        rows.collect()
    }

    /// The live scan plus roster devices seen within `keep_ms` that didn't
    /// answer, so a device aged out of the ARP table shows as Offline with a
    /// "last seen" time instead of vanishing. A scanner can't tell asleep from
    /// gone, so the list never asserts a departure; the reader judges from the
    /// age.
    pub fn devices_with_offline(
        &self,
        live: &[LanDevice],
        now_ms: i64,
        keep_ms: i64,
    ) -> rusqlite::Result<Vec<LanDevice>> {
        let live_macs: HashSet<&str> = live.iter().map(|d| d.mac.as_str()).filter(|m| !m.is_empty()).collect();
        let known: HashMap<String, KnownDevice> =
            self.known_devices()?.into_iter().filter(|kd| !kd.mac.is_empty()).map(|kd| (kd.mac.clone(), kd)).collect();
        let mut merged: Vec<LanDevice> = live
            .iter()
            .cloned()
            .map(|mut d| {
                d.last_seen = Some(now_ms);
                // A device in the ARP table but not answering is rebuilt from
                // thin evidence (a phone asleep in power-save announces nothing)
                // and would read "Generic device". Backfill from the roster, but
                // only while unreachable: a live device's scan may reclassify it.
                if !d.is_reachable {
                    if let Some(kd) = known.get(&d.mac) {
                        d.hostname = d.hostname.take().or_else(|| kd.hostname.clone());
                        d.vendor = d.vendor.take().or_else(|| kd.vendor.clone());
                        d.os = d.os.take().or_else(|| kd.os.clone());
                        if d.kind == "unknown" && kd.kind != "unknown" {
                            d.kind = kd.kind.clone();
                        }
                        // A remembered kind is settled, not a thin-margin guess,
                        // so don't hedge it with a "?" while the device is away.
                        d.kind_confidence = "high";
                    }
                }
                d
            })
            .collect();
        for kd in known.into_values() {
            if live_macs.contains(kd.mac.as_str()) {
                continue;
            }
            if now_ms - kd.last_seen > keep_ms {
                continue;
            }
            merged.push(LanDevice {
                ip: kd.ip.unwrap_or_default(),
                mac: kd.mac,
                vendor: kd.vendor,
                hostname: kd.hostname,
                model: None,
                os: kd.os,
                kind: kd.kind,
                // Settled, as above.
                kind_confidence: "high",
                is_randomized_mac: kd.randomized,
                is_gateway: false,
                is_self: false,
                is_reachable: false,
                last_seen: Some(kd.last_seen),
            });
        }
        Ok(merged)
    }
}

#[cfg(test)]
mod tests;
