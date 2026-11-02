//! The network-change feed: storing, naming and pruning its events, plus the
//! ones about this machine's own connection and internet.
use super::devices::KnownDevice;
use super::Store;
use crate::devices::LanDevice;
use crate::diagnostics::InternetStatus;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

/// One entry in the network-change feed, derived by diffing successive scans
/// against the remembered device roster. Field names are camelCase on the wire.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkEvent {
    pub id: i64,
    pub ts: i64, // epoch ms
    /// One of the `EVENT_*` slugs below; drives the icon/copy the UI renders.
    #[serde(rename = "type")]
    pub event_type: String,
    /// "info" | "warning" | "critical" — the row's visual weight.
    pub severity: String,
    pub mac: Option<String>,
    pub ip: Option<String>,
    /// Best-effort device label captured at event time (the device's identity
    /// may drift later, so we snapshot what it was called then).
    pub name: Option<String>,
    /// The device's kind slug (e.g. "phone", "tv") for device-subject events,
    /// read live from the current roster so the timeline can show a category
    /// alongside the name — the same "Phone" the Devices view shows. `None` when
    /// the kind is unknown or the event isn't about a single device (an SSID, a
    /// count, a gateway change).
    pub kind: Option<String>,
    /// For change events: the value before and after (e.g. old/new IP).
    pub old_value: Option<String>,
    pub new_value: Option<String>,
    /// The device's MAC was privacy-randomized. Presence events for such
    /// devices are inherently noisy (a phone re-randomizes roughly daily and
    /// then reads as brand-new), so the UI flags rather than hides them.
    pub is_randomized: bool,
}

// Event-type slugs. Kept as constants so the detector and any tests reference
// the same strings the UI switches on.
/// The one-time baseline row the first populated scan writes, so a brand-new
/// feed reads as "13 devices discovered" rather than a blank page. Its
/// `new_value` carries the device count.
pub(super) const EVENT_INITIAL_SCAN: &str = "initial_scan";

pub(super) const EVENT_DEVICE_JOINED: &str = "device_joined";

pub(super) const EVENT_AP_APPEARED: &str = "ap_appeared";

pub(super) const EVENT_DEVICE_OFFLINE: &str = "device_offline";

pub(super) const EVENT_DEVICE_ONLINE: &str = "device_online";

pub(super) const EVENT_GATEWAY_CHANGED: &str = "gateway_changed";

/// This machine joined a Wi-Fi / Ethernet network. Unlike the events above,
/// these describe *our own* connection (from `network_info`) rather than a LAN
/// device, and are diffed against the last connection stashed in `meta`.
const EVENT_WIFI_CONNECTED: &str = "wifi_connected";

const EVENT_ETHERNET_CONNECTED: &str = "ethernet_connected";

/// This machine lost its network connection entirely (dropped to disconnected).
/// One of these stands in for the flood of per-device "offline" rows a scan
/// would otherwise emit while offline — with no uplink we can't confirm any host,
/// so every device looks departed, but the truth is that *we* left, not them.
const EVENT_CONNECTION_LOST: &str = "connection_lost";

/// This machine lost / regained public-internet reachability (the WAN), as
/// classified by the diagnostics poll's [`InternetStatus`]. Distinct from
/// `connection_lost`, which tracks the local link (Wi-Fi/Ethernet) dropping: the
/// internet can be unreachable while the link is up (an ISP outage), and this
/// pair captures exactly that — mirroring the online/offline split the Services
/// timeline already shows.
const EVENT_INTERNET_LOST: &str = "internet_lost";

const EVENT_INTERNET_RESTORED: &str = "internet_restored";

/// `meta` key holding the last connection this machine was on, so a change of
/// network can be detected across the frequent `network_info` polls.
pub(super) const META_CONNECTION_IDENTITY: &str = "connection_identity";

/// `meta` key holding the last internet-reachability verdict ("online"/"offline"),
/// so a WAN up/down transition can be detected across diagnostics polls.
const META_INTERNET_STATUS: &str = "internet_status";

/// Drop events older than this (matches the 7-day feed consumer tools keep).
const EVENT_RETENTION_MS: i64 = 7 * 24 * 60 * 60 * 1000;

/// Hard cap on retained events, so a churny network can't grow the table
/// without bound even inside the retention window.
const EVENT_LIMIT: i64 = 1000;

impl Store {
    /// Record the machine's own active connection, appending an event when it
    /// changes to a newly-joined Wi-Fi or Ethernet network. Called on every
    /// `network_info` fetch (app load, `network-changed` nudges, polling), so it
    /// mirrors the gateway detector: the last connection lives in `meta`, an
    /// unchanged connection is silent, and the first-ever observation only seeds
    /// the baseline — opening the app on a network you're already on isn't a
    /// "connected" event. A drop to disconnected updates the baseline (so the
    /// next reconnect fires) but posts no event of its own.
    ///
    /// `network_name` is the Wi-Fi SSID (None off Wi-Fi); `interface` is the
    /// active interface, which is what distinguishes one wired link from another
    /// when there's no SSID to key on. `ip`/`mac` are this machine's own, shown
    /// as the event's context line.
    pub fn record_connection(
        &self,
        connection_type: &str,
        network_name: Option<&str>,
        interface: Option<&str>,
        ip: Option<&str>,
        mac: Option<&str>,
        now_ms: i64,
    ) -> rusqlite::Result<()> {
        // The discriminator between networks: the SSID on Wi-Fi, the interface
        // on Ethernet. Anything else (disconnected, VPN, cellular) has no
        // connect event but still updates the baseline below.
        let label = match connection_type {
            "wifi" => network_name,
            "ethernet" => interface,
            _ => None,
        };
        let identity = format!("{connection_type}|{}", label.unwrap_or(""));

        let mut conn = self.lock();
        let prev: Option<String> = conn
            .query_row(
                "SELECT value FROM meta WHERE key = ?1",
                [META_CONNECTION_IDENTITY],
                |row| row.get(0),
            )
            .optional()?;

        // Unchanged connection — the common case on a poll. Nothing to do.
        if prev.as_deref() == Some(identity.as_str()) {
            return Ok(());
        }

        let tx = conn.transaction()?;
        // Emit only on a transition *into* a connected Wi-Fi/Ethernet state, and
        // only once a baseline exists (so the first observation after launch is
        // silent rather than a spurious "connected").
        if let Some(prev) = prev.as_deref() {
            // A transition *into* a connected network is a connect event; a
            // transition from a connected network *out* to disconnected is a
            // connection-lost event. Anything else (still disconnected, VPN↔VPN)
            // is silent. `prev_connected` gates the loss so we don't fire it when
            // we were already off-network (e.g. VPN → disconnected).
            let prev_connected =
                prev.starts_with("wifi|") || prev.starts_with("ethernet|");
            let event: Option<(&str, &str, &str)> = match connection_type {
                "wifi" => Some((EVENT_WIFI_CONNECTED, "info", network_name.unwrap_or("Wi-Fi"))),
                "ethernet" => {
                    Some((EVENT_ETHERNET_CONNECTED, "info", interface.unwrap_or("Ethernet")))
                }
                // Dropped off the network. Name what we lost from the prior
                // baseline — the new state has no interface/SSID of its own.
                _ if prev_connected => {
                    let lost = prev.split_once('|').map(|(_, label)| label).unwrap_or("");
                    let lost = if lost.is_empty() { "your network" } else { lost };
                    Some((EVENT_CONNECTION_LOST, "warning", lost))
                }
                _ => None,
            };
            if let Some((event_type, severity, name)) = event {
                Self::record_event_raw(
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

        tx.execute(
            "INSERT INTO meta (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![META_CONNECTION_IDENTITY, identity],
        )?;
        tx.commit()?;
        Ok(())
    }

    /// Log an internet-reachability transition. The diagnostics poll classifies
    /// whether this machine can reach the public internet (see [`InternetStatus`]);
    /// this diffs that verdict against the last one stashed in `meta` and, on a
    /// crossing, appends a single `internet_lost` / `internet_restored` event.
    ///
    /// `noInternet` (WAN down but on a LAN) and `offline` (no network at all) both
    /// collapse to "no internet" here — the timeline only cares whether the public
    /// internet is reachable, matching the Services timeline's online/offline
    /// split. The first observation after launch is silent (it just seeds the
    /// baseline in `meta`), so a cold start doesn't read as a fresh outage.
    ///
    /// Best-effort and safe to call on every poll: an unchanged verdict does
    /// nothing.
    pub fn record_internet(&self, internet: InternetStatus, now_ms: i64) -> rusqlite::Result<()> {
        // Collapse the three-way status to the only axis this event tracks: can we
        // reach the public internet, or not.
        let online = matches!(internet, InternetStatus::Online);
        let value = if online { "online" } else { "offline" };

        let mut conn = self.lock();
        let prev: Option<String> = conn
            .query_row(
                "SELECT value FROM meta WHERE key = ?1",
                [META_INTERNET_STATUS],
                |row| row.get(0),
            )
            .optional()?;

        // Unchanged since the last poll — the common case. Nothing to record.
        if prev.as_deref() == Some(value) {
            return Ok(());
        }

        let tx = conn.transaction()?;
        // Emit only on a genuine crossing, and only once a baseline exists, so the
        // first observation after launch seeds `meta` silently rather than logging
        // a phantom outage or recovery.
        if prev.is_some() {
            let (event_type, severity) = if online {
                (EVENT_INTERNET_RESTORED, "info")
            } else {
                (EVENT_INTERNET_LOST, "warning")
            };
            Self::record_event_raw(
                &tx, now_ms, event_type, severity, None, None, None, None, None, false,
            )?;
            Self::prune_events(&tx, now_ms)?;
        }

        tx.execute(
            "INSERT INTO meta (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![META_INTERNET_STATUS, value],
        )?;
        tx.commit()?;
        Ok(())
    }

    /// Whether the feed has never held an event — true only before the first
    /// baseline scan writes its summary row.
    pub(super) fn events_is_empty(conn: &Connection) -> rusqlite::Result<bool> {
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM network_events", [], |row| row.get(0))?;
        Ok(count == 0)
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

    /// Best-effort label for a remembered device (used for departures, where we
    /// only have the stored row). Mirrors `device_name` so a device reads the
    /// same when it leaves as when it joined.
    pub(super) fn known_name(device: &KnownDevice) -> Option<String> {
        Self::compose_name(
            device.hostname.as_deref(),
            device.vendor.as_deref(),
            device.os.as_deref(),
            &device.kind,
        )
    }

    /// The event-feed device label, mirroring the live Devices view's
    /// `deviceName`/`describeUnnamed` (DevicesView.tsx): a real hostname, else a
    /// noun built from the maker (vendor/OS) and the kind we learned ("Apple
    /// phone", "Android phone", "Phone"). Returns `None` only when nothing at all
    /// is known — the caller then falls back to "Private device"/"Unknown device"
    /// from the randomized flag.
    fn compose_name(
        hostname: Option<&str>,
        vendor: Option<&str>,
        os: Option<&str>,
        kind: &str,
    ) -> Option<String> {
        // A real hostname is the name the user gave the device — it always wins.
        if let Some(hostname) = hostname {
            return Some(hostname.to_string());
        }
        let noun = Self::kind_noun(kind);
        // A known maker keeps the kind beside it rather than replacing it, so a
        // device's kind never drops out of the name. A vendor is a brand (proper
        // noun), so it reads as maker · type — "Apple · Phone" — matching the
        // dot-separated meta line; an OS reads as a natural phrase below.
        if let Some(vendor) = vendor {
            // Exception: a smart-home device's noun ("smart home device") is
            // verbose and already carried by the kind chip beside the name, so the
            // maker stands alone there — mirroring `deviceName` in DevicesView.tsx.
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

    /// The human noun for a device kind, mirroring the frontend `KIND_NOUNS`
    /// map. `None` for the "unknown" sentinel (nothing worth naming).
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

    /// Uppercase the first character, leaving the rest as-is (so "NAS" and
    /// "game console" survive: "NAS", "Game console").
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
        Self::record_event_raw(
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
    pub(super) fn record_event_raw(
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
    /// A device-subject event's label is resolved against the *current* roster,
    /// not just the snapshot taken when it fired: once the classifier learns more
    /// about a MAC (evidence accrues across scans), its past presence events read
    /// with the improved identity too, so a device that departed as "Private
    /// device" reads "Android phone" once it's been pinned. The LEFT JOIN keeps
    /// events whose device has since left the roster — they fall back to the
    /// stored snapshot, as do events whose `name` isn't a device label at all
    /// (the SSID on wifi_connected, the count on initial_scan, "Router" on
    /// gateway_changed). `kd.mac` being non-null is the "still known" signal.
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
            // Only events whose `name` is a device identity get relabeled from
            // the live roster; connection/baseline/gateway rows keep their
            // snapshot (their `name` is an SSID, a count, or a fixed "Router").
            let is_device_subject = matches!(
                event_type.as_str(),
                EVENT_DEVICE_JOINED
                    | EVENT_AP_APPEARED
                    | EVENT_DEVICE_OFFLINE
                    | EVENT_DEVICE_ONLINE
            );
            let in_roster = row.get::<_, Option<String>>(10)?.is_some();
            let (name, randomized, kind) = if is_device_subject && in_roster {
                // Relabel the way the live Devices view would now; keep the
                // snapshot if the current roster can't name it any better.
                let kd_kind: String = row.get(14)?;
                let live = Self::compose_name(
                    row.get::<_, Option<String>>(11)?.as_deref(),
                    row.get::<_, Option<String>>(12)?.as_deref(),
                    row.get::<_, Option<String>>(13)?.as_deref(),
                    &kd_kind,
                );
                // Carry the roster kind so the timeline can show a category next
                // to the name; the "unknown" sentinel has nothing worth showing.
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

        // First observation just seeds the baseline — launching on an existing
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

        // A cable goes in → ethernet_connected, carrying the interface name.
        store
            .record_connection("ethernet", None, Some("eth0"), Some("192.168.1.6"), Some("aa:bb:cc:dd:ee:00"), 2_000)
            .unwrap();
        let latest = &store.network_events(1).unwrap()[0];
        assert_eq!(latest.event_type, "ethernet_connected");
        assert_eq!(latest.name.as_deref(), Some("eth0"));

        // Unplug → connection_lost (warning), naming the network we dropped from
        // the prior baseline, since the disconnected state carries no interface.
        store
            .record_connection("disconnected", None, None, None, None, 3_000)
            .unwrap();
        let latest = &store.network_events(1).unwrap()[0];
        assert_eq!(latest.event_type, "connection_lost");
        assert_eq!(latest.severity, "warning");
        assert_eq!(latest.name.as_deref(), Some("eth0"), "names the lost network");

        // A second disconnected poll (still off-network) is silent — the loss
        // already fired, and there's no connected baseline to leave again.
        let before = types(&store).len();
        store
            .record_connection("disconnected", None, None, None, None, 3_200)
            .unwrap();
        assert_eq!(types(&store).len(), before, "staying disconnected emits nothing further");

        // …and back onto Wi-Fi → wifi_connected with the SSID as its subject.
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

        // First observation just seeds the baseline — launching with working
        // internet isn't a "restored" event.
        store.record_internet(InternetStatus::Online, 1_000).unwrap();
        assert!(types(&store).is_empty(), "the first verdict only seeds a baseline");

        // Re-polling the same verdict is silent.
        store.record_internet(InternetStatus::Online, 1_500).unwrap();
        assert!(types(&store).is_empty(), "an unchanged verdict emits nothing");

        // WAN drops while still on a LAN → a single internet_lost (warning).
        store.record_internet(InternetStatus::NoInternet, 2_000).unwrap();
        let latest = &store.network_events(1).unwrap()[0];
        assert_eq!(latest.event_type, "internet_lost");
        assert_eq!(latest.severity, "warning");

        // Dropping the gateway too (offline) is still "no internet" — no second
        // event, since we never regained reachability in between.
        let before = types(&store).len();
        store.record_internet(InternetStatus::Offline, 2_500).unwrap();
        assert_eq!(
            types(&store).len(),
            before,
            "noInternet → offline is still offline, so nothing new fires"
        );

        // Back online → internet_restored (info).
        store.record_internet(InternetStatus::Online, 3_000).unwrap();
        let latest = &store.network_events(1).unwrap()[0];
        assert_eq!(latest.event_type, "internet_restored");
        assert_eq!(latest.severity, "info");
    }
}
