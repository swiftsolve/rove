//! The roster of LAN devices seen across scans, and the feed events a scan
//! diff derives from it: joins, departures, returns and gateway changes.
use super::events::{
    is_connected_identity, NewEvent, Severity, EVENT_AP_APPEARED, EVENT_DEVICE_JOINED, EVENT_DEVICE_OFFLINE,
    EVENT_DEVICE_ONLINE, EVENT_GATEWAY_CHANGED, EVENT_INITIAL_SCAN, META_CONNECTION_IDENTITY,
};
use super::Store;
use crate::devices::LanDevice;
use crate::devices::{DeviceKind, KindConfidence};
use crate::utils::mac::MacAddress;
use rusqlite::{params, Connection, Row};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::net::Ipv4Addr;

/// A LAN device as remembered across scans, with first/last-seen timestamps.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnownDevice {
    pub mac: MacAddress,
    pub ip: Option<Ipv4Addr>,
    pub hostname: Option<String>,
    pub vendor: Option<String>,
    /// OS family from the DHCP fingerprint ("Android", "Apple"), kept so a
    /// departed device with no hostname or vendor still reads "Android device"
    /// in the feed (see `known_name`).
    pub os: Option<String>,
    pub kind: DeviceKind,
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
/// good clears on its own.
///
/// Its roster row stays in the database.
pub const OFFLINE_LIST_KEEP_MS: i64 = 24 * 60 * 60 * 1000;

/// `meta` key prefix for each network's gateway MAC as last seen, the
/// baseline `detect_gateway_change` diffs against. Keyed by network, so
/// moving to another network's router isn't a change.
const META_GATEWAY_MAC: &str = "gateway_mac";

/// The `known_devices` columns in the order `known_device_from_row` reads them.
const KNOWN_DEVICE_COLUMNS: &str = "mac, ip, hostname, vendor, kind, first_seen, last_seen, os, randomized";

/// A roster row, or `None` when its stored MAC doesn't parse: such a row can't
/// match any device a scan finds, so it's skipped rather than failing the
/// whole roster. A stored IP that doesn't parse reads as `None`.
fn known_device_from_row(row: &Row) -> rusqlite::Result<Option<KnownDevice>> {
    let Some(mac) = read_mac(row, 0)? else {
        return Ok(None);
    };
    let ip_text: Option<String> = row.get(1)?;
    Ok(Some(KnownDevice {
        mac,
        ip: ip_text.and_then(|text| text.parse().ok()),
        hostname: row.get(2)?,
        vendor: row.get(3)?,
        kind: row.get(4)?,
        first_seen: row.get(5)?,
        last_seen: row.get(6)?,
        os: row.get(7)?,
        randomized: row.get(8)?,
    }))
}

/// The MAC in column `index`: `None` for NULL, and for text that doesn't parse
/// as a MAC, which callers treat as absent rather than an error.
pub(super) fn read_mac(row: &Row, index: usize) -> rusqlite::Result<Option<MacAddress>> {
    match row.get::<_, Option<MacAddress>>(index) {
        Err(rusqlite::Error::FromSqlConversionFailure(..)) => Ok(None),
        result => result,
    }
}

/// Whether the newest event for `mac` is its departure, so it reads offline
/// until it returns.
fn is_marked_offline(last_event: &HashMap<MacAddress, String>, mac: MacAddress) -> bool {
    last_event.get(&mac).map(String::as_str) == Some(EVENT_DEVICE_OFFLINE)
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
                device.ip.to_string(),
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
    fn bump_last_seen(conn: &Connection, mac: MacAddress, ip: Ipv4Addr, now_ms: i64) -> rusqlite::Result<()> {
        conn.execute(
            "UPDATE known_devices SET ip = ?2, last_seen = ?3 WHERE mac = ?1",
            params![mac, ip.to_string(), now_ms],
        )?;
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

        for device in present.iter().filter(|d| d.is_reachable) {
            let Some(mac) = device.mac else {
                continue;
            };
            match prior.get(&mac) {
                None => {
                    // Store its thin identity so the arrival isn't blank; the
                    // next active scan enriches it.
                    Self::emit_new_device(&tx, device, now_ms)?;
                    Self::upsert_device(&tx, device, now_ms)?;
                }
                Some(_) => {
                    // Mirror `record_devices`' online transition, so a device
                    // returning while the window is hidden still lands on the feed.
                    if is_marked_offline(&last_event, mac) {
                        Self::record_device_event(
                            &tx,
                            now_ms,
                            device,
                            NewEvent::new(EVENT_DEVICE_ONLINE, Severity::Info),
                        )?;
                    }
                    Self::bump_last_seen(&tx, mac, device.ip, now_ms)?;
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
        let live: HashSet<MacAddress> = devices.iter().filter(|d| d.is_reachable).filter_map(|d| d.mac).collect();

        for device in devices {
            let Some(mac) = device.mac else {
                continue;
            };
            if !is_seeding_feed {
                let is_known = prior.contains_key(&mac);
                Self::emit_arrival(&tx, device, mac, is_known, is_roster_empty, &last_event, now_ms)?;
            }
            Self::upsert_device(&tx, device, now_ms)?;
        }

        // This machine's link as `record_connection` last saw it. Off-network,
        // every peer stops answering at once; that's our link dropping, not the
        // LAN emptying. Never polled reads as connected, so real departures
        // aren't suppressed.
        let connection_identity = Self::read_meta(&tx, META_CONNECTION_IDENTITY)?;
        let host_connected = connection_identity.as_deref().is_none_or(is_connected_identity);

        // Departures, unless this machine itself dropped off: an empty `live`
        // set (the scan failed) or a disconnected host (macOS still lists self
        // as reachable on a downed link, so `live` alone can't tell). The one
        // `connection_lost` from `record_connection` stands in for the burst.
        if !is_seeding_feed && !live.is_empty() && host_connected {
            Self::emit_departures(&tx, &prior, &live, &last_event, now_ms)?;
        }

        // A gateway MAC changing on the same network is the classic
        // rogue-gateway or ARP-spoof signal. With no stored baseline for this
        // network it only records one.
        Self::detect_gateway_change(&tx, devices, connection_identity.as_deref(), now_ms)?;

        if is_seeding_feed {
            Self::seed_feed(&tx, devices, now_ms)?;
        }

        Self::prune_events(&tx, now_ms)?;
        tx.commit()?;
        Ok(())
    }

    /// A new device's "joined" (or "AP appeared") row, or a known one's
    /// "back online". A new device on an empty roster is the baseline, so it
    /// logs nothing.
    fn emit_arrival(
        conn: &Connection,
        device: &LanDevice,
        mac: MacAddress,
        is_known: bool,
        is_roster_empty: bool,
        last_event: &HashMap<MacAddress, String>,
        now_ms: i64,
    ) -> rusqlite::Result<()> {
        if !is_known {
            return if is_roster_empty { Ok(()) } else { Self::emit_new_device(conn, device, now_ms) };
        }
        // Gate on `is_reachable` so a device back in the ARP table but not
        // answering doesn't read as reconnected. Identity changes (hostname, IP,
        // vendor, kind) aren't logged: they proved too noisy.
        if device.is_reachable && is_marked_offline(last_event, mac) {
            Self::record_device_event(conn, now_ms, device, NewEvent::new(EVENT_DEVICE_ONLINE, Severity::Info))?;
        }
        Ok(())
    }

    /// An "offline" row for each recently seen device that didn't answer this
    /// scan and isn't already marked offline.
    fn emit_departures(
        conn: &Connection,
        prior: &HashMap<MacAddress, KnownDevice>,
        live: &HashSet<MacAddress>,
        last_event: &HashMap<MacAddress, String>,
        now_ms: i64,
    ) -> rusqlite::Result<()> {
        let departed = prior.iter().filter(|(mac, prev)| {
            !live.contains(*mac)
                && now_ms - prev.last_seen <= OFFLINE_RECENCY_MS
                && !is_marked_offline(last_event, **mac)
        });
        for (mac, prev) in departed {
            let name = Self::known_name(prev);
            let ip_text = prev.ip.map(|ip| ip.to_string());
            let event = NewEvent {
                mac: Some(*mac),
                ip: ip_text.as_deref(),
                name: name.as_deref(),
                is_randomized: prev.randomized,
                ..NewEvent::new(EVENT_DEVICE_OFFLINE, Severity::Info)
            };
            Self::insert_event(conn, now_ms, &event)?;
        }
        Ok(())
    }

    /// The first populated scan's one "N devices discovered" row, after which
    /// the feed counts as seeded.
    fn seed_feed(conn: &Connection, devices: &[LanDevice], now_ms: i64) -> rusqlite::Result<()> {
        let count = devices.iter().filter(|d| d.mac.is_some()).count();
        if count == 0 {
            return Ok(());
        }
        let count = count.to_string();
        let event = NewEvent { new_value: Some(&count), ..NewEvent::new(EVENT_INITIAL_SCAN, Severity::Info) };
        Self::insert_event(conn, now_ms, &event)?;
        Self::mark_feed_seeded(conn)
    }

    /// The roster keyed by MAC: a scan's diff baseline.
    fn load_known_map(conn: &Connection) -> rusqlite::Result<HashMap<MacAddress, KnownDevice>> {
        let mut stmt = conn.prepare(&format!("SELECT {KNOWN_DEVICE_COLUMNS} FROM known_devices"))?;
        let rows = stmt.query_map([], known_device_from_row)?;
        let mut map = HashMap::new();
        for row in rows {
            if let Some(device) = row? {
                map.insert(device.mac, device);
            }
        }
        Ok(map)
    }

    /// The newest event `type` per MAC, skipping a stored MAC that doesn't parse.
    fn load_last_event_types(conn: &Connection) -> rusqlite::Result<HashMap<MacAddress, String>> {
        let mut stmt = conn.prepare(
            "SELECT mac, type FROM network_events WHERE id IN
                (SELECT MAX(id) FROM network_events WHERE mac IS NOT NULL GROUP BY mac)",
        )?;
        let rows = stmt.query_map([], |row| Ok((read_mac(row, 0)?, row.get::<_, String>(1)?)))?;
        let mut map = HashMap::new();
        for row in rows {
            if let (Some(mac), event_type) = row? {
                map.insert(mac, event_type);
            }
        }
        Ok(map)
    }

    /// A router that isn't our gateway is a new AP or mesh node, a
    /// higher-signal security event; anything else is a plain arrival.
    fn emit_new_device(conn: &Connection, device: &LanDevice, ts: i64) -> rusqlite::Result<()> {
        let (event_type, severity) = if device.kind == DeviceKind::Router && !device.is_gateway {
            (EVENT_AP_APPEARED, Severity::Warning)
        } else {
            (EVENT_DEVICE_JOINED, Severity::Info)
        };
        Self::record_device_event(conn, ts, device, NewEvent::new(event_type, severity))
    }

    /// Usually a replaced router or a mesh node taking over, rarely an attack,
    /// so a warning: worth a look, not an alarm.
    fn detect_gateway_change(
        conn: &Connection,
        devices: &[LanDevice],
        network: Option<&str>,
        ts: i64,
    ) -> rusqlite::Result<()> {
        let Some(gateway) = devices.iter().find(|d| d.is_gateway && d.mac.is_some()) else {
            return Ok(());
        };
        let Some(gateway_mac) = gateway.mac else {
            return Ok(());
        };
        let gateway_mac_text = gateway_mac.to_string();
        let key = format!("{META_GATEWAY_MAC}|{}", network.unwrap_or(""));
        let prev = Self::read_meta(conn, &key)?;
        if let Some(old) = prev.as_deref() {
            if old != gateway_mac_text {
                let event = NewEvent {
                    old_value: Some(old),
                    new_value: Some(&gateway_mac_text),
                    ..NewEvent::new(EVENT_GATEWAY_CHANGED, Severity::Warning)
                };
                Self::record_device_event(conn, ts, gateway, event)?;
            }
        }
        Self::write_meta(conn, &key, &gateway_mac_text)
    }

    /// Every device we've ever recorded, most-recently-seen first, less any row
    /// whose stored MAC doesn't parse.
    pub fn known_devices(&self) -> rusqlite::Result<Vec<KnownDevice>> {
        let conn = self.lock();
        let mut stmt =
            conn.prepare(&format!("SELECT {KNOWN_DEVICE_COLUMNS} FROM known_devices ORDER BY last_seen DESC"))?;
        let rows = stmt.query_map([], known_device_from_row)?;
        let mut devices = Vec::new();
        for row in rows {
            if let Some(device) = row? {
                devices.push(device);
            }
        }
        Ok(devices)
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
        let live_macs: HashSet<MacAddress> = live.iter().filter_map(|d| d.mac).collect();
        let known: HashMap<MacAddress, KnownDevice> =
            self.known_devices()?.into_iter().map(|kd| (kd.mac, kd)).collect();
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
                    if let Some(kd) = d.mac.and_then(|mac| known.get(&mac)) {
                        d.hostname = d.hostname.take().or_else(|| kd.hostname.clone());
                        d.vendor = d.vendor.take().or_else(|| kd.vendor.clone());
                        d.os = d.os.take().or_else(|| kd.os.clone());
                        if d.kind == DeviceKind::Unknown && kd.kind != DeviceKind::Unknown {
                            d.kind = kd.kind;
                        }
                        // A remembered kind is settled, not a thin-margin guess,
                        // so don't hedge it with a "?" while the device is away.
                        d.kind_confidence = KindConfidence::High;
                    }
                }
                d
            })
            .collect();
        for kd in known.into_values() {
            if live_macs.contains(&kd.mac) {
                continue;
            }
            if now_ms - kd.last_seen > keep_ms {
                continue;
            }
            // A row with no usable IP has nothing to show in the IP column.
            let Some(ip) = kd.ip else {
                continue;
            };
            merged.push(LanDevice {
                ip,
                mac: Some(kd.mac),
                vendor: kd.vendor,
                hostname: kd.hostname,
                model: None,
                os: kd.os,
                kind: kd.kind,
                // Settled, as above.
                kind_confidence: KindConfidence::High,
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
