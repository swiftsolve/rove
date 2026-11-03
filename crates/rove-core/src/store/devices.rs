//! The roster of LAN devices seen across scans, and the feed events a scan
//! diff derives from it: joins, departures, returns and gateway changes.
use super::events::{
    EVENT_AP_APPEARED, EVENT_DEVICE_JOINED, EVENT_DEVICE_OFFLINE, EVENT_DEVICE_ONLINE,
    EVENT_GATEWAY_CHANGED, EVENT_INITIAL_SCAN, META_CONNECTION_IDENTITY,
};
use super::Store;
use crate::devices::LanDevice;
use rusqlite::{params, Connection, OptionalExtension};
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
    /// OS family from the DHCP fingerprint (e.g. "Android", "Apple"), persisted
    /// so a departed device with no hostname/vendor can still read "Android
    /// device" in the feed instead of collapsing to "Unknown" (see `known_name`).
    pub os: Option<String>,
    pub kind: String,
    /// Whether the scans that saw this device reported a privacy-randomized MAC.
    /// Persisted so a departure event can carry it — otherwise a randomized
    /// phone reads "Private device" when it joins but "Unknown device" when it
    /// leaves, since the departure path only has this stored row to work from.
    pub randomized: bool,
    pub first_seen: i64,
    pub last_seen: i64,
}

/// A device is only an "offline" candidate when it was seen this recently
/// before a scan missed it. Anything older is the historical roster (a device
/// that left days ago), not one that just dropped — so it never fires, which is
/// what keeps a fresh scan after a long gap from marking everything offline.
const OFFLINE_RECENCY_MS: i64 = 15 * 60 * 1000;

/// How long an offline device stays in the Devices list after it last answered.
/// It lingers marked Offline (with a "last seen" time) for a day, then drops out
/// — long enough to cover a phone asleep overnight, short enough that a device
/// truly gone for good clears on its own. The roster row is kept in the DB.
pub const OFFLINE_LIST_KEEP_MS: i64 = 24 * 60 * 60 * 1000;

impl Store {
    // ---- known LAN devices -------------------------------------------------

    /// Upsert one device row. First-seen is set on insert and preserved on
    /// conflict; the mutable fields (ip/hostname/vendor/kind) advance to the
    /// latest, keeping a previously-known hostname/vendor when this scan lacks
    /// one. `conn` is the open transaction (a `Transaction` derefs here).
    ///
    /// `kind` follows the same keep-what-we-knew rule as hostname/vendor/os: a
    /// scan that fails to classify the device (a phone asleep in power-save
    /// answers nothing, so it reads back as `unknown`) must not erase a kind we
    /// settled on earlier — otherwise a device that was a "phone" collapses to a
    /// "Generic device" the moment it stops answering. A confident new
    /// classification (any non-`unknown` kind) still advances it.
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

    /// Bump only the liveness columns (`ip`, `last_seen`) of an existing row,
    /// leaving the identity (hostname/vendor/kind/os) exactly as an active scan
    /// settled it. Used by the passive refresh, whose thin evidence must never
    /// overwrite a better name; a row that doesn't exist yet is simply not
    /// touched (the caller inserts genuinely new devices via `upsert_device`).
    fn bump_last_seen(conn: &Connection, mac: &str, ip: &str, now_ms: i64) -> rusqlite::Result<()> {
        conn.execute(
            "UPDATE known_devices SET ip = ?2, last_seen = ?3 WHERE mac = ?1",
            params![mac, ip, now_ms],
        )?;
        Ok(())
    }

    /// Record a passive presence sweep — the devices the background refresh could
    /// positively confirm are on the network right now (see
    /// [`crate::devices::passive_refresh`]). Unlike [`Self::record_devices`] this
    /// asserts **no** departures: passive discovery can't prove a device is gone,
    /// so a host missing from `present` is left as-is rather than marked offline.
    /// The refresh only ever advances the roster forward — it bumps `last_seen`
    /// for a known device, logs a genuinely new MAC as an arrival, and re-flags a
    /// device that had gone offline as back online. A known device's richer
    /// identity is preserved (see [`Self::bump_last_seen`]).
    ///
    /// No-ops until an active scan has seeded the roster: seeding a partial
    /// passive view (only the announcing hosts) would make that first full scan
    /// report every silent device as a new arrival.
    pub fn touch_devices(&self, present: &[LanDevice], now_ms: i64) -> rusqlite::Result<()> {
        let mut conn = self.lock();
        let prior = Self::load_known_map(&conn)?;
        // Wait for the first active scan to establish the baseline (see above).
        if prior.is_empty() {
            return Ok(());
        }
        let tx = conn.transaction()?;
        let last_event = Self::load_last_event_types(&tx)?;

        for device in present.iter().filter(|d| !d.mac.is_empty() && d.is_reachable) {
            match prior.get(&device.mac) {
                None => {
                    // A device we've never recorded, seen only passively. Store
                    // its (thin) identity so the arrival isn't blank, and announce
                    // it — an active scan will enrich it on the next real scan.
                    Self::emit_new_device(&tx, device, now_ms)?;
                    Self::upsert_device(&tx, device, now_ms)?;
                }
                Some(_) => {
                    // Back after we'd marked it offline: mirror `record_devices`'
                    // online transition so a device returning while the window is
                    // backgrounded still lands on the feed.
                    if last_event.get(&device.mac).map(String::as_str)
                        == Some(EVENT_DEVICE_OFFLINE)
                    {
                        Self::record_event(
                            &tx,
                            now_ms,
                            EVENT_DEVICE_ONLINE,
                            "info",
                            device,
                            None,
                            None,
                        )?;
                    }
                    Self::bump_last_seen(&tx, &device.mac, &device.ip, now_ms)?;
                }
            }
        }

        Self::prune_events(&tx, now_ms)?;
        tx.commit()?;
        Ok(())
    }

    /// Upsert the devices from a scan and derive the network-change events that
    /// scan implies (arrivals, departures, and mutated identity), diffing the
    /// batch against the remembered roster before it's overwritten.
    pub fn record_devices(&self, devices: &[LanDevice], now_ms: i64) -> rusqlite::Result<()> {
        let mut conn = self.lock();
        let tx = conn.transaction()?;

        // The baseline we diff against — captured before any upsert overwrites it.
        let prior = Self::load_known_map(&tx)?;
        // Most-recent event per MAC, to drive the offline↔online state machine
        // and keep a departed device a single "offline" row until it returns.
        let last_event = Self::load_last_event_types(&tx)?;
        // A first-ever scan (empty roster) is a baseline, not a burst of new
        // arrivals: remember the devices but emit no join/AP events for them, so
        // the very first scan doesn't produce a wall of "joined" rows.
        let bootstrap = prior.is_empty();
        // The first scan to ever write to the feed is a pure baseline. Instead
        // of leaving the page blank (or bursting granular events for an existing
        // user upgrading into the feature), we record the roster, summarize it
        // as one "N devices discovered" row, and suppress the per-device diff
        // this once — real join/change/offline events start on the next scan.
        let seed = Self::events_is_empty(&tx)?;

        // A device counts as present on the feed only when it actually answered
        // this scan. One still in the ARP table but failing liveness probes
        // (reachable=false) reads "Offline" in the Devices view, so treat it as
        // gone here too — otherwise the feed's offline/online state lags what the
        // user sees, staying silent until the OS ages the stale ARP entry out
        // (~20 min later). Self and the gateway are always reachable, so they
        // never spuriously drop. The liveness debounce (see `liveness`) holds a
        // device reachable until it has both missed several scans and stayed
        // silent for a wall-clock floor, so a brief sleep — or a burst of
        // event-driven scans landing seconds apart — doesn't flap the feed.
        let live: HashSet<&str> = devices
            .iter()
            .filter(|d| !d.mac.is_empty() && d.is_reachable)
            .map(|d| d.mac.as_str())
            .collect();

        for device in devices.iter().filter(|d| !d.mac.is_empty()) {
            if !seed {
                match prior.get(&device.mac) {
                    None => {
                        if !bootstrap {
                            Self::emit_new_device(&tx, device, now_ms)?;
                        }
                    }
                    Some(_) => {
                        // Answered again after we'd marked it offline. Gate on
                        // `reachable` so a device that's back in the ARP table
                        // but still not responding doesn't read as reconnected.
                        if device.is_reachable
                            && last_event.get(&device.mac).map(String::as_str)
                                == Some(EVENT_DEVICE_OFFLINE)
                        {
                            Self::record_event(
                                &tx,
                                now_ms,
                                EVENT_DEVICE_ONLINE,
                                "info",
                                device,
                                None,
                                None,
                            )?;
                        }
                        // Identity changes (hostname/IP/vendor/kind) are no longer
                        // surfaced as events — they proved too noisy to be useful.
                    }
                }
            }
            Self::upsert_device(&tx, device, now_ms)?;
        }

        // The host's own link state, as last recorded by `record_connection`
        // (identity `"wifi|…"`/`"ethernet|…"` when connected, `"disconnected|"`
        // otherwise). A scan that runs while this machine is itself off-network
        // sees every LAN peer stop answering at once — that's our uplink dropping,
        // not the whole network emptying out. An absent identity (never polled)
        // reads as connected so we don't over-suppress a genuine departure.
        let host_connected: bool = tx
            .query_row(
                "SELECT value FROM meta WHERE key = ?1",
                [META_CONNECTION_IDENTITY],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .map(|id| id.starts_with("wifi|") || id.starts_with("ethernet|"))
            .unwrap_or(true);

        // Departures: recently-seen devices that didn't answer this scan —
        // whether absent entirely or present but failing liveness. Skip any
        // already marked offline so a device stays one event until it returns.
        // Suppressed on the seed scan along with the rest of the diff.
        //
        // Two conditions suppress the whole burst, both meaning "this machine
        // dropped off, the LAN didn't empty out":
        //   * An empty `live` set — *nothing at all* answered, not even self or
        //     the gateway (always reachable when we have a link): the scan wholly
        //     failed.
        //   * The host itself is disconnected — on macOS a downed uplink still
        //     enumerates `self` as reachable, so `live` is non-empty and the check
        //     above misses it; the stored connection identity catches it.
        // In both cases the single `connection_lost` event (from
        // `record_connection`) represents the drop instead. The devices are
        // untouched, so they simply resume when we return.
        if !seed && !live.is_empty() && host_connected {
            for (mac, prev) in &prior {
                if live.contains(mac.as_str()) {
                    continue;
                }
                if now_ms - prev.last_seen > OFFLINE_RECENCY_MS {
                    continue;
                }
                if last_event.get(mac).map(String::as_str) == Some(EVENT_DEVICE_OFFLINE) {
                    continue;
                }
                Self::record_event_raw(
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

        // The default gateway's MAC changing under us is the classic
        // rogue-gateway / ARP-spoof signal — track it across scans on its own.
        // Self-guards on the stored baseline, so on a seed scan it just records
        // the current gateway (no event) for future scans to diff against.
        Self::detect_gateway_change(&tx, devices, now_ms)?;

        // The baseline summary — one row so a fresh feed isn't blank.
        if seed {
            let count = devices.iter().filter(|d| !d.mac.is_empty()).count();
            if count > 0 {
                Self::record_event_raw(
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
            }
        }

        Self::prune_events(&tx, now_ms)?;
        tx.commit()?;
        Ok(())
    }

    /// The remembered roster keyed by MAC — the diff baseline for a scan.
    fn load_known_map(conn: &Connection) -> rusqlite::Result<HashMap<String, KnownDevice>> {
        let mut stmt = conn.prepare(
            "SELECT mac, ip, hostname, vendor, kind, first_seen, last_seen, os, randomized \
             FROM known_devices",
        )?;
        let rows = stmt.query_map([], |row| {
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
        })?;
        let mut map = HashMap::new();
        for row in rows {
            let device = row?;
            map.insert(device.mac.clone(), device);
        }
        Ok(map)
    }

    /// Most-recent event `type` per MAC (the newest row wins), for the
    /// offline/online state machine.
    fn load_last_event_types(conn: &Connection) -> rusqlite::Result<HashMap<String, String>> {
        let mut stmt = conn.prepare(
            "SELECT mac, type FROM network_events WHERE id IN
                (SELECT MAX(id) FROM network_events WHERE mac IS NOT NULL GROUP BY mac)",
        )?;
        let rows =
            stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?;
        let mut map = HashMap::new();
        for row in rows {
            let (mac, event_type) = row?;
            map.insert(mac, event_type);
        }
        Ok(map)
    }

    /// A newly-seen device: a router that isn't our gateway is a new AP / mesh
    /// node (a higher-signal security event), everything else a plain arrival.
    fn emit_new_device(conn: &Connection, device: &LanDevice, ts: i64) -> rusqlite::Result<()> {
        let (event_type, severity) = if device.kind == "router" && !device.is_gateway {
            (EVENT_AP_APPEARED, "warning")
        } else {
            (EVENT_DEVICE_JOINED, "info")
        };
        Self::record_event(conn, ts, event_type, severity, device, None, None)
    }

    /// Compare this scan's gateway MAC to the last one we recorded (in `meta`),
    /// emitting a critical event on a change and always refreshing the baseline.
    fn detect_gateway_change(
        conn: &Connection,
        devices: &[LanDevice],
        ts: i64,
    ) -> rusqlite::Result<()> {
        let Some(gateway) = devices.iter().find(|d| d.is_gateway && !d.mac.is_empty()) else {
            return Ok(());
        };
        let prev: Option<String> = conn
            .query_row("SELECT value FROM meta WHERE key = 'gateway_mac'", [], |row| {
                row.get(0)
            })
            .optional()?;
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
        conn.execute(
            "INSERT INTO meta (key, value) VALUES ('gateway_mac', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![gateway.mac],
        )?;
        Ok(())
    }

    /// Every device we've ever recorded, most-recently-seen first.
    pub fn known_devices(&self) -> rusqlite::Result<Vec<KnownDevice>> {
        let conn = self.lock();
        let mut stmt = conn.prepare(
            "SELECT mac, ip, hostname, vendor, kind, first_seen, last_seen, os, randomized
             FROM known_devices ORDER BY last_seen DESC",
        )?;
        let rows = stmt.query_map([], |row| {
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
        })?;
        rows.collect()
    }

    /// The live scan merged with recently-seen roster devices that didn't answer
    /// this scan, so a device that has aged out of the ARP table still shows as
    /// Offline (with a "last seen" time) instead of vanishing. Live devices are
    /// stamped with `now_ms`; a roster-only device carries its stored `last_seen`
    /// and is dropped from the list once that's older than `keep_ms` (its row is
    /// still kept in the DB). A scanner can't tell "asleep" from "gone", so the
    /// list never asserts a departure — it just reports how long ago each device
    /// was last seen and lets the reader judge.
    pub fn devices_with_offline(
        &self,
        live: &[LanDevice],
        now_ms: i64,
        keep_ms: i64,
    ) -> rusqlite::Result<Vec<LanDevice>> {
        let live_macs: HashSet<&str> =
            live.iter().map(|d| d.mac.as_str()).filter(|m| !m.is_empty()).collect();
        let known: HashMap<String, KnownDevice> = self
            .known_devices()?
            .into_iter()
            .filter(|kd| !kd.mac.is_empty())
            .map(|kd| (kd.mac.clone(), kd))
            .collect();
        let mut merged: Vec<LanDevice> = live
            .iter()
            .cloned()
            .map(|mut d| {
                d.last_seen = Some(now_ms);
                // A device still in the ARP table but not answering this scan is
                // rebuilt from thin evidence: a randomized-MAC phone asleep in
                // power-save announces nothing, so this pass has no hostname,
                // vendor or kind for it and it would read "Generic device" even
                // though we identified it minutes ago. Backfill the gaps from the
                // remembered roster so an offline device keeps its last-known
                // identity. Only while unreachable — a live device's fresh scan is
                // authoritative and may legitimately reclassify it.
                if !d.is_reachable {
                    if let Some(kd) = known.get(&d.mac) {
                        d.hostname = d.hostname.take().or_else(|| kd.hostname.clone());
                        d.vendor = d.vendor.take().or_else(|| kd.vendor.clone());
                        d.os = d.os.take().or_else(|| kd.os.clone());
                        if d.kind == "unknown" && kd.kind != "unknown" {
                            d.kind = kd.kind.clone();
                        }
                        // A remembered kind is a settled fact, not a thin-margin
                        // guess — don't hedge it with a "?" while the device is away.
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
                // The kind we stored is a settled fact, not a fresh thin-margin
                // guess, so don't hedge it with a "?" while the device is away.
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
