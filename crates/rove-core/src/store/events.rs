//! The network-change feed: storing, naming and pruning its events, plus the
//! ones about this machine's own connection and internet.
use super::devices::KnownDevice;
use super::Store;
use crate::devices::LanDevice;
use crate::diagnostics::InternetStatus;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

/// One entry in the network-change feed. Mirrors `NetworkEvent` in `src/types/events.ts`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkEvent {
    pub id: i64,
    /// Epoch ms.
    pub ts: i64,
    /// One of the `EVENT_*` slugs below; picks the icon and copy the UI renders.
    #[serde(rename = "type")]
    pub event_type: String,
    /// "info", "warning" or "critical": the row's visual weight.
    pub severity: String,
    pub mac: Option<String>,
    pub ip: Option<String>,
    /// Best-effort label snapshotted at event time, since a device's identity
    /// can drift later.
    pub name: Option<String>,
    /// The device's kind slug ("phone", "tv"), read live from the roster so the
    /// timeline shows the same category as the Devices view. `None` when unknown
    /// or when the event isn't about one device.
    pub kind: Option<String>,
    /// For change events: the value before and after (e.g. old/new IP).
    pub old_value: Option<String>,
    pub new_value: Option<String>,
    /// The MAC is privacy-randomized. Such a device's presence events are noisy
    /// (a phone can re-randomize and read as brand-new), so the UI flags them.
    pub is_randomized: bool,
}

// Event-type slugs: the strings the UI switches on, shared by the detector and
// the tests.

/// The one-time baseline row the first populated scan writes, so a new feed
/// reads "13 devices discovered" rather than a blank page. `new_value` carries
/// the count.
pub(super) const EVENT_INITIAL_SCAN: &str = "initial_scan";

pub(super) const EVENT_DEVICE_JOINED: &str = "device_joined";

pub(super) const EVENT_AP_APPEARED: &str = "ap_appeared";

pub(super) const EVENT_DEVICE_OFFLINE: &str = "device_offline";

pub(super) const EVENT_DEVICE_ONLINE: &str = "device_online";

pub(super) const EVENT_GATEWAY_CHANGED: &str = "gateway_changed";

/// This machine joined a Wi-Fi or Ethernet network. Unlike the events above,
/// these are about *our own* connection, diffed against the last one in `meta`.
const EVENT_WIFI_CONNECTED: &str = "wifi_connected";

const EVENT_ETHERNET_CONNECTED: &str = "ethernet_connected";

/// This machine dropped off its network. One row stands in for the flood of
/// per-device "offline" rows a scan would emit: with no link every device looks
/// departed, but it was *us* that left.
const EVENT_CONNECTION_LOST: &str = "connection_lost";

/// This machine lost or regained the public internet. Distinct from
/// `connection_lost` (the local link dropping): the internet can be unreachable
/// while the link is up, as in an ISP outage.
const EVENT_INTERNET_LOST: &str = "internet_lost";

const EVENT_INTERNET_RESTORED: &str = "internet_restored";

/// `meta` key for the last connection this machine was on, so a network change
/// is caught across `network_info` polls. The value is `"<type>|<label>"`, as
/// built in `record_connection`.
pub(super) const META_CONNECTION_IDENTITY: &str = "connection_identity";

/// Whether a stored connection identity is a Wi-Fi or Ethernet link, rather
/// than disconnected, VPN or cellular.
pub(super) fn is_connected_identity(identity: &str) -> bool {
    identity.starts_with("wifi|") || identity.starts_with("ethernet|")
}

/// Set once a device scan has written the feed's baseline. A flag, not "the
/// feed is empty": a connection event can land before the first scan, and
/// pruning can empty the feed later, and neither should change the answer.
const META_FEED_SEEDED: &str = "feed_seeded";

/// `meta` key for the last internet verdict ("online"/"offline"), so a crossing
/// is caught across checks.
const META_INTERNET_STATUS: &str = "internet_status";

/// A week, the window consumer network tools typically keep.
const EVENT_RETENTION_MS: i64 = 7 * 24 * 60 * 60 * 1000;

/// Hard cap, so a churny network can't grow the table without bound inside the
/// retention window.
const EVENT_LIMIT: i64 = 1000;

impl Store {
    /// Record this machine's active connection, logging joining a Wi-Fi or
    /// Ethernet network and dropping off one. Called on every `network_info`
    /// fetch, so an unchanged connection is silent, and the first observation
    /// only seeds the baseline: opening the app on a network you're already on
    /// isn't a "connected" event.
    ///
    /// `network_name` is the SSID (None off Wi-Fi); `interface` tells one wired
    /// link from another where there's no SSID. `ip`/`mac` are this machine's
    /// own, shown as the event's context line.
    pub fn record_connection(
        &self,
        connection_type: &str,
        network_name: Option<&str>,
        interface: Option<&str>,
        ip: Option<&str>,
        mac: Option<&str>,
        now_ms: i64,
    ) -> rusqlite::Result<()> {
        // The SSID on Wi-Fi, the interface on Ethernet. Anything else
        // (disconnected, VPN, cellular) has no connect event but still updates
        // the baseline.
        let label = match connection_type {
            "wifi" => network_name,
            "ethernet" => interface,
            _ => None,
        };
        let identity = format!("{connection_type}|{}", label.unwrap_or(""));

        let mut conn = self.lock();
        let prev = Self::read_meta(&conn, META_CONNECTION_IDENTITY)?;

        if prev.as_deref() == Some(identity.as_str()) {
            return Ok(());
        }

        let tx = conn.transaction()?;
        // No baseline yet: the first observation after launch stays silent.
        if let Some(prev) = prev.as_deref() {
            // `prev_connected` keeps a loss from firing when we were already
            // off-network (VPN to disconnected, say).
            let prev_connected = is_connected_identity(prev);
            let event: Option<(&str, &str, &str)> = match connection_type {
                "wifi" => Some((EVENT_WIFI_CONNECTED, "info", network_name.unwrap_or("Wi-Fi"))),
                "ethernet" => {
                    Some((EVENT_ETHERNET_CONNECTED, "info", interface.unwrap_or("Ethernet")))
                }
                // Name what we lost from the prior baseline: the new state has
                // no interface or SSID of its own.
                _ if prev_connected => {
                    let lost = prev.split_once('|').map(|(_, label)| label).unwrap_or("");
                    let lost = if lost.is_empty() { "your network" } else { lost };
                    Some((EVENT_CONNECTION_LOST, "warning", lost))
                }
                _ => None,
            };
            if let Some((event_type, severity, name)) = event {
                Self::insert_event(
                    &tx,
                    now_ms,
                    event_type,
                    severity,
                    mac,
                    ip,
                    Some(name),
                    None,
                    None,
                    false,
                )?;
                Self::prune_events(&tx, now_ms)?;
            }
        }

        Self::write_meta(&tx, META_CONNECTION_IDENTITY, &identity)?;
        tx.commit()?;
        Ok(())
    }

    /// Log an `internet_lost` or `internet_restored` when the verdict crosses
    /// the last one in `meta`. `NoInternet` (WAN down, still on a LAN) and
    /// `Offline` both count as no internet. The first observation after launch
    /// only seeds the baseline, so a cold start doesn't read as an outage. An
    /// unchanged verdict does nothing, so every internet check can call it.
    pub fn record_internet(&self, internet: InternetStatus, now_ms: i64) -> rusqlite::Result<()> {
        let online = matches!(internet, InternetStatus::Online);
        let value = if online { "online" } else { "offline" };

        let mut conn = self.lock();
        let prev = Self::read_meta(&conn, META_INTERNET_STATUS)?;

        if prev.as_deref() == Some(value) {
            return Ok(());
        }

        let tx = conn.transaction()?;
        if prev.is_some() {
            let (event_type, severity) = if online {
                (EVENT_INTERNET_RESTORED, "info")
            } else {
                (EVENT_INTERNET_LOST, "warning")
            };
            Self::insert_event(
                &tx, now_ms, event_type, severity, None, None, None, None, None, false,
            )?;
            Self::prune_events(&tx, now_ms)?;
        }

        Self::write_meta(&tx, META_INTERNET_STATUS, value)?;
        tx.commit()?;
        Ok(())
    }

    /// Whether a device scan has seeded the feed. A feed from before the flag
    /// existed counts as seeded if it holds any device-scan event.
    pub(super) fn is_feed_seeded(conn: &Connection) -> rusqlite::Result<bool> {
        let has_flag = conn
            .query_row("SELECT 1 FROM meta WHERE key = ?1", [META_FEED_SEEDED], |_| Ok(()))
            .optional()?
            .is_some();
        if has_flag {
            return Ok(true);
        }
        let has_scan_event = conn
            .query_row(
                "SELECT 1 FROM network_events WHERE type IN (?1, ?2, ?3, ?4, ?5, ?6) LIMIT 1",
                [
                    EVENT_INITIAL_SCAN,
                    EVENT_DEVICE_JOINED,
                    EVENT_AP_APPEARED,
                    EVENT_DEVICE_OFFLINE,
                    EVENT_DEVICE_ONLINE,
                    EVENT_GATEWAY_CHANGED,
                ],
                |_| Ok(()),
            )
            .optional()?
            .is_some();
        if has_scan_event {
            Self::mark_feed_seeded(conn)?;
        }
        Ok(has_scan_event)
    }

    pub(super) fn mark_feed_seeded(conn: &Connection) -> rusqlite::Result<()> {
        conn.execute(
            "INSERT OR IGNORE INTO meta (key, value) VALUES (?1, '1')",
            [META_FEED_SEEDED],
        )?;
        Ok(())
    }

    /// Best-effort human label for a live device at event time.
    fn device_name(device: &LanDevice) -> Option<String> {
        if device.is_gateway {
            return Some("Router".to_string());
        }
        Self::compose_name(
            device.hostname.as_deref(),
            device.vendor.as_deref(),
            device.os.as_deref(),
            &device.kind,
        )
    }

    /// Best-effort label from the stored row, for departures. Matches
    /// `device_name` so a device reads the same leaving as joining.
    pub(super) fn known_name(device: &KnownDevice) -> Option<String> {
        Self::compose_name(
            device.hostname.as_deref(),
            device.vendor.as_deref(),
            device.os.as_deref(),
            &device.kind,
        )
    }

    /// The feed's device label, mirroring `deviceName`/`describeUnnamed` in
    /// `src/features/devices/utils/device-display.ts`: the hostname, else the
    /// maker (vendor or OS) with the kind ("Android phone", "Phone").
    /// `None` only when nothing is known; the UI then says "Private device" or
    /// "Unknown device".
    fn compose_name(
        hostname: Option<&str>,
        vendor: Option<&str>,
        os: Option<&str>,
        kind: &str,
    ) -> Option<String> {
        // A hostname is the name the user gave the device, so it always wins.
        if let Some(hostname) = hostname {
            return Some(hostname.to_string());
        }
        let noun = Self::kind_noun(kind);
        // A vendor is a brand, so it stands beside the kind as a separate part
        // rather than in a phrase, as an OS does below. The UI splits on " · "
        // (`subjectParts` in event-copy.ts) and draws a real dot there.
        if let Some(vendor) = vendor {
            // The kind label beside the name already says "Smart home", so the
            // verbose noun would repeat it.
            if kind == "iot" {
                return Some(vendor.to_string());
            }
            return Some(match noun {
                Some(noun) => format!("{vendor} · {}", Self::capitalize(noun)),
                None => vendor.to_string(),
            });
        }
        match (os, noun) {
            (Some(os), Some(noun)) => Some(format!("{os} {noun}")),
            (Some(os), None) => Some(format!("{os} device")),
            (None, Some(noun)) => Some(Self::capitalize(noun)),
            (None, None) => None,
        }
    }

    /// The noun for a device kind, mirroring `KIND_NOUNS` in
    /// `device-display.ts`. `None` for "unknown".
    fn kind_noun(kind: &str) -> Option<&'static str> {
        Some(match kind {
            "router" => "router",
            "nas" => "NAS",
            "computer" => "computer",
            "tablet" => "tablet",
            "phone" => "phone",
            "watch" => "watch",
            "console" => "game console",
            "tv" => "TV",
            "printer" => "printer",
            "camera" => "camera",
            "speaker" => "speaker",
            "iot" => "smart home device",
            _ => return None,
        })
    }

    /// Uppercase only the first character, so "NAS" survives.
    fn capitalize(s: &str) -> String {
        let mut chars = s.chars();
        match chars.next() {
            Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
            None => String::new(),
        }
    }

    pub(super) fn record_event(
        conn: &Connection,
        ts: i64,
        event_type: &str,
        severity: &str,
        device: &LanDevice,
        old_value: Option<&str>,
        new_value: Option<&str>,
    ) -> rusqlite::Result<()> {
        Self::insert_event(
            conn,
            ts,
            event_type,
            severity,
            Some(&device.mac),
            Some(&device.ip),
            Self::device_name(device).as_deref(),
            old_value,
            new_value,
            device.is_randomized_mac,
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub(super) fn insert_event(
        conn: &Connection,
        ts: i64,
        event_type: &str,
        severity: &str,
        mac: Option<&str>,
        ip: Option<&str>,
        name: Option<&str>,
        old_value: Option<&str>,
        new_value: Option<&str>,
        randomized: bool,
    ) -> rusqlite::Result<()> {
        conn.execute(
            "INSERT INTO network_events
                (ts, type, severity, mac, ip, name, old_value, new_value, randomized)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![ts, event_type, severity, mac, ip, name, old_value, new_value, randomized],
        )?;
        Ok(())
    }

    /// Trim the feed to the retention window and the hard row cap.
    pub(super) fn prune_events(conn: &Connection, now_ms: i64) -> rusqlite::Result<()> {
        conn.execute(
            "DELETE FROM network_events WHERE ts < ?1",
            [now_ms - EVENT_RETENTION_MS],
        )?;
        conn.execute(
            "DELETE FROM network_events WHERE id NOT IN
                (SELECT id FROM network_events ORDER BY ts DESC, id DESC LIMIT ?1)",
            [EVENT_LIMIT],
        )?;
        Ok(())
    }

    /// The change feed, newest first, capped at `limit`.
    ///
    /// A device event's label is resolved against the *current* roster, not
    /// just its snapshot: as evidence about a MAC accrues across scans, its past
    /// events pick up the better identity, so a device that left as "Private
    /// device" reads "Android phone" once pinned. The LEFT JOIN keeps events
    /// whose device has left the roster; they, and events whose `name` isn't a
    /// device label (an SSID, a count, "Router"), keep the snapshot.
    pub fn network_events(&self, limit: i64) -> rusqlite::Result<Vec<NetworkEvent>> {
        let conn = self.lock();
        let mut stmt = conn.prepare(
            "SELECT e.id, e.ts, e.type, e.severity, e.mac, e.ip, e.name,
                    e.old_value, e.new_value, e.randomized,
                    kd.mac, kd.hostname, kd.vendor, kd.os, kd.kind, kd.randomized
             FROM network_events e
             LEFT JOIN known_devices kd ON kd.mac = e.mac
             -- Retired event types (hostname changes, and the app start/stop
             -- lifecycle rows) are no longer produced; hide any that a prior
             -- version already recorded so they age out of view at once.
             WHERE e.type NOT IN ('hostname_changed', 'app_started', 'app_stopped')
             ORDER BY e.ts DESC, e.id DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map([limit], |row| {
            let event_type: String = row.get(2)?;
            let stored_name: Option<String> = row.get(6)?;
            let stored_randomized = row.get::<_, i64>(9)? != 0;
            let is_device_subject = matches!(
                event_type.as_str(),
                EVENT_DEVICE_JOINED
                    | EVENT_AP_APPEARED
                    | EVENT_DEVICE_OFFLINE
                    | EVENT_DEVICE_ONLINE
            );
            let in_roster = row.get::<_, Option<String>>(10)?.is_some();
            let (name, randomized, kind) = if is_device_subject && in_roster {
                // Keep the snapshot if the roster can't name it any better.
                let kd_kind: String = row.get(14)?;
                let live = Self::compose_name(
                    row.get::<_, Option<String>>(11)?.as_deref(),
                    row.get::<_, Option<String>>(12)?.as_deref(),
                    row.get::<_, Option<String>>(13)?.as_deref(),
                    &kd_kind,
                );
                let kind = (kd_kind != "unknown").then_some(kd_kind);
                (live.or(stored_name), row.get::<_, i64>(15)? != 0, kind)
            } else {
                (stored_name, stored_randomized, None)
            };
            Ok(NetworkEvent {
                id: row.get(0)?,
                ts: row.get(1)?,
                event_type,
                severity: row.get(3)?,
                mac: row.get(4)?,
                ip: row.get(5)?,
                name,
                kind,
                old_value: row.get(7)?,
                new_value: row.get(8)?,
                is_randomized: randomized,
            })
        })?;
        rows.collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn records_connection_transitions_but_stays_quiet_on_the_baseline() {
        let store = Store::open_in_memory().unwrap();
        let types = |store: &Store| {
            store
                .network_events(100)
                .unwrap()
                .into_iter()
                .map(|e| e.event_type)
                .collect::<Vec<_>>()
        };

        // First observation just seeds the baseline: launching on an existing
        // Wi-Fi connection isn't a "connected" event.
        store
            .record_connection("wifi", Some("Home"), Some("wlan0"), Some("192.168.1.5"), Some("aa:bb:cc:dd:ee:ff"), 1_000)
            .unwrap();
        assert!(types(&store).is_empty(), "the first connection only seeds a baseline");

        // Re-polling the same network is silent.
        store
            .record_connection("wifi", Some("Home"), Some("wlan0"), Some("192.168.1.5"), Some("aa:bb:cc:dd:ee:ff"), 1_500)
            .unwrap();
        assert!(types(&store).is_empty(), "an unchanged connection emits nothing");

        // A cable goes in: ethernet_connected, carrying the interface name.
        store
            .record_connection("ethernet", None, Some("eth0"), Some("192.168.1.6"), Some("aa:bb:cc:dd:ee:00"), 2_000)
            .unwrap();
        let latest = &store.network_events(1).unwrap()[0];
        assert_eq!(latest.event_type, "ethernet_connected");
        assert_eq!(latest.name.as_deref(), Some("eth0"));

        // Unplug: connection_lost (warning), naming the network we dropped from
        // the prior baseline, since the disconnected state carries no interface.
        store
            .record_connection("disconnected", None, None, None, None, 3_000)
            .unwrap();
        let latest = &store.network_events(1).unwrap()[0];
        assert_eq!(latest.event_type, "connection_lost");
        assert_eq!(latest.severity, "warning");
        assert_eq!(latest.name.as_deref(), Some("eth0"), "names the lost network");

        // A second disconnected poll is silent: the loss already fired.
        let before = types(&store).len();
        store
            .record_connection("disconnected", None, None, None, None, 3_200)
            .unwrap();
        assert_eq!(types(&store).len(), before, "staying disconnected emits nothing further");

        // Back onto Wi-Fi: wifi_connected with the SSID as its subject.
        store
            .record_connection("wifi", Some("Cafe"), Some("wlan0"), Some("10.0.0.9"), Some("aa:bb:cc:dd:ee:ff"), 4_000)
            .unwrap();
        let latest = &store.network_events(1).unwrap()[0];
        assert_eq!(latest.event_type, "wifi_connected");
        assert_eq!(latest.name.as_deref(), Some("Cafe"));
    }

    #[test]
    fn records_internet_transitions_but_stays_quiet_on_the_baseline() {
        let store = Store::open_in_memory().unwrap();
        let types = |store: &Store| {
            store
                .network_events(100)
                .unwrap()
                .into_iter()
                .map(|e| e.event_type)
                .collect::<Vec<_>>()
        };

        // First observation just seeds the baseline: launching with working
        // internet isn't a "restored" event.
        store.record_internet(InternetStatus::Online, 1_000).unwrap();
        assert!(types(&store).is_empty(), "the first verdict only seeds a baseline");

        // Re-polling the same verdict is silent.
        store.record_internet(InternetStatus::Online, 1_500).unwrap();
        assert!(types(&store).is_empty(), "an unchanged verdict emits nothing");

        // WAN drops while still on a LAN: one internet_lost (warning).
        store.record_internet(InternetStatus::NoInternet, 2_000).unwrap();
        let latest = &store.network_events(1).unwrap()[0];
        assert_eq!(latest.event_type, "internet_lost");
        assert_eq!(latest.severity, "warning");

        // Losing the gateway too is still "no internet", so no second event.
        let before = types(&store).len();
        store.record_internet(InternetStatus::Offline, 2_500).unwrap();
        assert_eq!(
            types(&store).len(),
            before,
            "noInternet → offline is still offline, so nothing new fires"
        );

        // Back online: internet_restored (info).
        store.record_internet(InternetStatus::Online, 3_000).unwrap();
        let latest = &store.network_events(1).unwrap()[0];
        assert_eq!(latest.event_type, "internet_restored");
        assert_eq!(latest.severity, "info");
    }
}
