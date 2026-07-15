//! The app's single durable store: one SQLite file in the app-data directory.
//!
//! Everything worth keeping across restarts lives here — speed-test history,
//! daily data-usage buckets, and the roster of LAN devices we've seen. The
//! Rust side owns it (the samplers and scans that produce the data run here),
//! and the UI reaches it through thin Tauri commands. All methods lock an
//! internal `Mutex<Connection>`, so a shared `Arc<Store>` is safe to hand to
//! both command handlers and the background usage sampler.
use crate::types::{InternetStatus, LanDevice};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::Mutex;

/// Newest-first cap on retained speed-test results, matching the old
/// localStorage behaviour the UI was built around.
pub const SPEED_HISTORY_LIMIT: i64 = 50;

/// One recorded speed test. Field names are camelCase on the wire so the
/// existing React `SpeedHistoryEntry` consumes them unchanged.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedHistoryRecord {
    pub timestamp: i64, // epoch ms
    pub download_mbps: f64,
    pub upload_mbps: f64,
    pub latency_ms: f64,
    pub jitter_ms: f64,
    pub packet_loss: f64,
    pub connection_type: String,
    pub network_name: Option<String>,
    pub link_speed_mbps: Option<f64>,
    pub frequency: Option<f64>, // Wi-Fi centre frequency (MHz), for band label
}

/// One service in the user's reachability list — the durable definition, without
/// a measurement. Ships with defaults but is editable per user. camelCase on the
/// wire to match the React `ServiceDefinition`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceDef {
    pub name: String,
    pub host: String,
}

/// The reachability services shipped by default. Seeded into the `services`
/// table on first creation; users add to or remove from the list thereafter.
pub const DEFAULT_SERVICES: &[(&str, &str)] = &[
    ("Google", "google.com"),
    ("Cloudflare", "cloudflare.com"),
    ("YouTube", "youtube.com"),
    ("Netflix", "netflix.com"),
    ("Zoom", "zoom.us"),
];

/// The defaults as owned `ServiceDef`s — the fallback a diagnostics run uses if
/// the store can't be read, so the card never blanks on a transient DB error.
pub fn default_service_list() -> Vec<ServiceDef> {
    DEFAULT_SERVICES
        .iter()
        .map(|&(name, host)| ServiceDef { name: name.to_string(), host: host.to_string() })
        .collect()
}

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
    pub randomized: bool,
}

// Event-type slugs. Kept as constants so the detector and any tests reference
// the same strings the UI switches on.
/// The one-time baseline row the first populated scan writes, so a brand-new
/// feed reads as "13 devices discovered" rather than a blank page. Its
/// `new_value` carries the device count.
const EVENT_INITIAL_SCAN: &str = "initial_scan";
const EVENT_DEVICE_JOINED: &str = "device_joined";
const EVENT_AP_APPEARED: &str = "ap_appeared";
const EVENT_DEVICE_OFFLINE: &str = "device_offline";
const EVENT_DEVICE_ONLINE: &str = "device_online";
const EVENT_GATEWAY_CHANGED: &str = "gateway_changed";
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
const META_CONNECTION_IDENTITY: &str = "connection_identity";
/// `meta` key holding the last internet-reachability verdict ("online"/"offline"),
/// so a WAN up/down transition can be detected across diagnostics polls.
const META_INTERNET_STATUS: &str = "internet_status";
/// `meta` key holding whether the services timeline currently sits inside a
/// recorded connection drop ("lost"/"restored"). Deliberately separate from
/// [`META_INTERNET_STATUS`]: that one is the device feed's baseline and is
/// consumed by `record_internet`'s own diff, so sharing it would mean whichever
/// recorder ran first swallowed the crossing before the other saw it.
const META_SERVICE_CONNECTION: &str = "service_connection_status";

/// Drop events older than this (matches the 7-day feed consumer tools keep).
const EVENT_RETENTION_MS: i64 = 7 * 24 * 60 * 60 * 1000;
/// Hard cap on retained events, so a churny network can't grow the table
/// without bound even inside the retention window.
const EVENT_LIMIT: i64 = 1000;

/// The services timeline keeps a longer memory than the device feed's 7 days:
/// "when was Netflix last down" is worth a month, and the log only grows on a
/// crossing, so a month of it is still tiny.
const SERVICE_EVENT_RETENTION_MS: i64 = 30 * 24 * 60 * 60 * 1000;
/// Hard cap on retained timeline entries, so a flapping service can't grow the
/// table without bound inside the retention window.
const SERVICE_EVENT_LIMIT: i64 = 500;
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

pub struct Store {
    conn: Mutex<Connection>,
}

const SCHEMA_V1: &str = "
CREATE TABLE IF NOT EXISTS speed_history (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp      INTEGER NOT NULL,
    download_mbps  REAL    NOT NULL,
    upload_mbps    REAL    NOT NULL,
    latency_ms     REAL    NOT NULL,
    jitter_ms      REAL    NOT NULL,
    packet_loss    REAL    NOT NULL,
    connection_type TEXT   NOT NULL,
    network_name   TEXT
);
CREATE INDEX IF NOT EXISTS idx_speed_history_ts ON speed_history(timestamp DESC);

CREATE TABLE IF NOT EXISTS usage_day (
    date      TEXT    PRIMARY KEY,
    rx_bytes  INTEGER NOT NULL DEFAULT 0,
    tx_bytes  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS known_devices (
    mac        TEXT PRIMARY KEY,
    ip         TEXT,
    hostname   TEXT,
    vendor     TEXT,
    os         TEXT,
    kind       TEXT    NOT NULL DEFAULT 'unknown',
    randomized INTEGER NOT NULL DEFAULT 0,
    first_seen INTEGER NOT NULL,
    last_seen  INTEGER NOT NULL
);
";

/// v2 — speed_history gains the link speed and Wi-Fi band captured at test time.
/// The old table is dropped and recreated rather than altered: past rows never
/// carried these fields and speed history is disposable, so there's nothing
/// worth preserving through the upgrade.
const SCHEMA_V2: &str = "
DROP TABLE IF EXISTS speed_history;
CREATE TABLE speed_history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp       INTEGER NOT NULL,
    download_mbps   REAL    NOT NULL,
    upload_mbps     REAL    NOT NULL,
    latency_ms      REAL    NOT NULL,
    jitter_ms       REAL    NOT NULL,
    packet_loss     REAL    NOT NULL,
    connection_type TEXT    NOT NULL,
    network_name    TEXT,
    link_speed_mbps REAL,
    frequency       REAL
);
CREATE INDEX IF NOT EXISTS idx_speed_history_ts ON speed_history(timestamp DESC);
";

/// v3 — the network-change event feed. Append-only; rows are derived by
/// diffing each scan against `known_devices` and pruned by age/count.
const SCHEMA_V3: &str = "
CREATE TABLE IF NOT EXISTS network_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ts         INTEGER NOT NULL,
    type       TEXT    NOT NULL,
    severity   TEXT    NOT NULL,
    mac        TEXT,
    ip         TEXT,
    name       TEXT,
    old_value  TEXT,
    new_value  TEXT,
    randomized INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_network_events_ts ON network_events(ts DESC);
";

/// v4 — the user-editable reachability service list. Seeded with the built-in
/// defaults exactly once (in the `version < 4` block), so removing a default
/// sticks: unlike the idempotent table-creation guards, the seed never re-runs.
const SCHEMA_V4: &str = "
CREATE TABLE IF NOT EXISTS services (
    host     TEXT    PRIMARY KEY,
    name     TEXT    NOT NULL,
    position INTEGER NOT NULL
);
";

/// v5 — the services outage timeline, previously a frontend localStorage log
/// that only accrued while the Services tab was open. Owning it here is what
/// lets the always-on heartbeat record an outage whether or not the window is
/// even up. Two tables: the append-only log (pruned by age/count), and the
/// per-host baseline the diff compares each probe against, so only crossings
/// land in the log.
///
/// `status` carries a transition's 'up'/'down' and a connection event's
/// 'lost'/'restored'; `count` is the running summary's tally. Each is null for
/// the shapes that don't use it — the row's `type` says which apply.
const SCHEMA_V5: &str = "
CREATE TABLE IF NOT EXISTS service_events (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    ts     INTEGER NOT NULL,
    type   TEXT    NOT NULL,
    host   TEXT,
    name   TEXT,
    status TEXT,
    count  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_service_events_ts ON service_events(ts DESC);
CREATE TABLE IF NOT EXISTS service_state (
    host   TEXT PRIMARY KEY,
    status TEXT NOT NULL
);
";

impl Store {
    /// Lock the connection, recovering the guard if a previous holder panicked
    /// rather than propagating the poison (which would wedge every subsequent
    /// query for the app's lifetime).
    fn lock(&self) -> std::sync::MutexGuard<'_, Connection> {
        crate::net_util::lock(&self.conn)
    }

    /// Open (creating if needed) the database at `path` and apply migrations.
    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        let conn = Connection::open(path)?;
        Self::from_connection(conn)
    }

    #[cfg(test)]
    pub fn open_in_memory() -> rusqlite::Result<Self> {
        Self::from_connection(Connection::open_in_memory()?)
    }

    fn from_connection(conn: Connection) -> rusqlite::Result<Self> {
        // WAL keeps the background sampler's writes from blocking UI reads.
        let _ = conn.pragma_update(None, "journal_mode", "WAL");
        let store = Self { conn: Mutex::new(conn) };
        store.migrate()?;
        Ok(store)
    }

    fn migrate(&self) -> rusqlite::Result<()> {
        let conn = self.lock();
        let version: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
        if version < 1 {
            conn.execute_batch(SCHEMA_V1)?;
            conn.pragma_update(None, "user_version", 1)?;
        }
        if version < 2 {
            conn.execute_batch(SCHEMA_V2)?;
            conn.pragma_update(None, "user_version", 2)?;
        }
        if version < 3 {
            conn.execute_batch(SCHEMA_V3)?;
            conn.pragma_update(None, "user_version", 3)?;
        }
        if version < 4 {
            conn.execute_batch(SCHEMA_V4)?;
            // Seed the defaults exactly once. INSERT OR IGNORE so a re-run of this
            // block (e.g. a colliding version number) can't duplicate rows, while
            // the version gate keeps deleted defaults from being resurrected.
            for (i, (name, host)) in DEFAULT_SERVICES.iter().enumerate() {
                conn.execute(
                    "INSERT OR IGNORE INTO services (host, name, position) VALUES (?1, ?2, ?3)",
                    params![host, name, i as i64],
                )?;
            }
            conn.pragma_update(None, "user_version", 4)?;
        }
        if version < 5 {
            conn.execute_batch(SCHEMA_V5)?;
            conn.pragma_update(None, "user_version", 5)?;
        }
        // Same defensive stance as the speed_history columns below: a colliding
        // user_version from a parallel branch could stamp the DB at >=3 without
        // ever creating this table, and every event insert/read would then fail
        // with "no such table". The DDL is `IF NOT EXISTS`, so (re)running it
        // unconditionally is idempotent and can't wedge the feed.
        conn.execute_batch(SCHEMA_V3)?;
        // Same guard for the services table — (re)creating it is idempotent and
        // never re-seeds, so a collided version number can't wedge the list.
        conn.execute_batch(SCHEMA_V4)?;
        // And the same for the timeline's tables, for the same reason: a version
        // number collided from another branch must not leave the heartbeat
        // writing into tables that were never created.
        conn.execute_batch(SCHEMA_V5)?;
        // Independently of the version counter, guarantee the columns the
        // insert/read SQL relies on actually exist. A parallel feature branch
        // also bumped the schema to v2 (adding its own `bufferbloat_ms` column),
        // so some installs reach user_version 2 without link_speed_mbps/frequency
        // — and the `version < 2` gate above then skips adding them. Every insert
        // and read would fail with "no such column" on those DBs. Add whatever is
        // missing, idempotently, so a collided version number can't wedge history.
        Self::ensure_column(&conn, "speed_history", "link_speed_mbps", "REAL")?;
        Self::ensure_column(&conn, "speed_history", "frequency", "REAL")?;
        // Scrub reverse-DNS error text that earlier builds stored as a hostname.
        // macOS `dig` prints diagnostics like ";; connection timed out; no servers
        // could be reached" to stdout, and it leaked through as a device name; the
        // `COALESCE` upsert then pins it forever. A real hostname holds only
        // `[A-Za-z0-9._-]`, so null anything with a character outside that set —
        // it re-resolves to the correct name (or Unknown) on the next scan. The
        // `IF EXISTS`-style guard keeps this safe on a DB that predates the table.
        let has_known_devices: bool = conn.query_row(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='known_devices'",
            [],
            |_| Ok(()),
        ).is_ok();
        if has_known_devices {
            conn.execute(
                "UPDATE known_devices SET hostname = NULL \
                 WHERE hostname IS NOT NULL AND hostname GLOB '*[^A-Za-z0-9._-]*'",
                [],
            )?;
            // Added after known_devices shipped without them: the OS family and
            // the randomized-MAC flag, so a departure event can label a device
            // the same way the live Devices view does rather than degrading to
            // "Unknown". Nullable/defaulted, so existing rows are untouched. The
            // `has_known_devices` guard keeps this safe on a DB whose collided
            // version number skipped the table's creation entirely.
            Self::ensure_column(&conn, "known_devices", "os", "TEXT")?;
            Self::ensure_column(&conn, "known_devices", "randomized", "INTEGER NOT NULL DEFAULT 0")?;
        }
        Ok(())
    }

    /// Add `column` to `table` if it isn't already present. Names are fixed
    /// literals from the migration, never user input, so interpolating them into
    /// the DDL is safe (and unavoidable — SQLite takes no bind params in DDL or
    /// PRAGMA). Nullable additive columns leave existing rows untouched.
    fn ensure_column(
        conn: &Connection,
        table: &str,
        column: &str,
        decl_type: &str,
    ) -> rusqlite::Result<()> {
        let present = conn
            .prepare(&format!("PRAGMA table_info({table})"))?
            .query_map([], |row| row.get::<_, String>(1))?
            .collect::<rusqlite::Result<Vec<String>>>()?
            .iter()
            .any(|name| name == column);
        if !present {
            conn.execute(
                &format!("ALTER TABLE {table} ADD COLUMN {column} {decl_type}"),
                [],
            )?;
        }
        Ok(())
    }

    // ---- speed-test history ------------------------------------------------

    /// Record one result and trim back to `SPEED_HISTORY_LIMIT` newest.
    pub fn insert_speed(&self, rec: &SpeedHistoryRecord) -> rusqlite::Result<()> {
        let conn = self.lock();
        conn.execute(
            "INSERT INTO speed_history
                (timestamp, download_mbps, upload_mbps, latency_ms, jitter_ms,
                 packet_loss, connection_type, network_name, link_speed_mbps, frequency)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                rec.timestamp,
                rec.download_mbps,
                rec.upload_mbps,
                rec.latency_ms,
                rec.jitter_ms,
                rec.packet_loss,
                rec.connection_type,
                rec.network_name,
                rec.link_speed_mbps,
                rec.frequency,
            ],
        )?;
        conn.execute(
            "DELETE FROM speed_history WHERE id NOT IN
                (SELECT id FROM speed_history ORDER BY timestamp DESC LIMIT ?1)",
            [SPEED_HISTORY_LIMIT],
        )?;
        Ok(())
    }

    /// Past results, newest first, capped at `SPEED_HISTORY_LIMIT`.
    pub fn speed_history(&self) -> rusqlite::Result<Vec<SpeedHistoryRecord>> {
        let conn = self.lock();
        let mut stmt = conn.prepare(
            "SELECT timestamp, download_mbps, upload_mbps, latency_ms, jitter_ms,
                    packet_loss, connection_type, network_name, link_speed_mbps, frequency
             FROM speed_history ORDER BY timestamp DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map([SPEED_HISTORY_LIMIT], |row| {
            Ok(SpeedHistoryRecord {
                timestamp: row.get(0)?,
                download_mbps: row.get(1)?,
                upload_mbps: row.get(2)?,
                latency_ms: row.get(3)?,
                jitter_ms: row.get(4)?,
                packet_loss: row.get(5)?,
                connection_type: row.get(6)?,
                network_name: row.get(7)?,
                link_speed_mbps: row.get(8)?,
                frequency: row.get(9)?,
            })
        })?;
        rows.collect()
    }

    pub fn clear_speed_history(&self) -> rusqlite::Result<()> {
        self.lock().execute("DELETE FROM speed_history", [])?;
        Ok(())
    }

    // ---- daily data usage --------------------------------------------------

    /// Add a delta into a day's bucket, creating the row on first write.
    pub fn add_usage(&self, date: &str, rx_delta: u64, tx_delta: u64) -> rusqlite::Result<()> {
        self.lock().execute(
            "INSERT INTO usage_day (date, rx_bytes, tx_bytes) VALUES (?1, ?2, ?3)
             ON CONFLICT(date) DO UPDATE SET
                rx_bytes = rx_bytes + excluded.rx_bytes,
                tx_bytes = tx_bytes + excluded.tx_bytes",
            params![date, rx_delta as i64, tx_delta as i64],
        )?;
        Ok(())
    }

    /// This day's accumulated bytes, or (0, 0) if untracked.
    pub fn usage_day(&self, date: &str) -> rusqlite::Result<(u64, u64)> {
        let conn = self.lock();
        let row = conn
            .query_row(
                "SELECT rx_bytes, tx_bytes FROM usage_day WHERE date = ?1",
                [date],
                |row| Ok((row.get::<_, i64>(0)? as u64, row.get::<_, i64>(1)? as u64)),
            )
            .optional()?;
        Ok(row.unwrap_or((0, 0)))
    }

    /// Keep only the `retain` most-recent days.
    pub fn prune_usage(&self, retain: usize) -> rusqlite::Result<()> {
        self.lock().execute(
            "DELETE FROM usage_day WHERE date NOT IN
                (SELECT date FROM usage_day ORDER BY date DESC LIMIT ?1)",
            [retain as i64],
        )?;
        Ok(())
    }

    pub fn usage_is_empty(&self) -> rusqlite::Result<bool> {
        let conn = self.lock();
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM usage_day", [], |row| row.get(0))?;
        Ok(count == 0)
    }

    // ---- small key/value meta ---------------------------------------------

    pub fn get_meta_u64(&self, key: &str) -> rusqlite::Result<Option<u64>> {
        let conn = self.lock();
        let value = conn
            .query_row("SELECT value FROM meta WHERE key = ?1", [key], |row| {
                row.get::<_, String>(0)
            })
            .optional()?;
        Ok(value.and_then(|s| s.parse().ok()))
    }

    pub fn set_meta_u64(&self, key: &str, value: u64) -> rusqlite::Result<()> {
        self.lock().execute(
            "INSERT INTO meta (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value.to_string()],
        )?;
        Ok(())
    }

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

        for device in present.iter().filter(|d| !d.mac.is_empty() && d.reachable) {
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
            .filter(|d| !d.mac.is_empty() && d.reachable)
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
                        if device.reachable
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

    /// Fold one probe batch into the services timeline, recording only what
    /// changed: a service crossing up or down, a `Running` baseline the first
    /// time the services are ever seen, a `Running` summary when the last outage
    /// clears, and a single connection drop/return when *this machine* is the one
    /// that's offline. Re-running with unchanged probes writes nothing, so the
    /// heartbeat can call it every tick.
    ///
    /// While this machine has no internet, per-service diffing freezes: every
    /// probe fails at once as a side effect of *our* outage, so logging them
    /// would be a wall of lies. Freezing means the eventual recovery diffs
    /// against the real pre-outage state rather than a phantom mass-down.
    pub fn record_services(
        &self,
        report: &crate::types::ServicesReport,
        now_ms: i64,
    ) -> rusqlite::Result<()> {
        use crate::types::{ConnectionChange, InternetStatus, ServiceEvent, ServiceStatus};

        if report.services.is_empty() {
            return Ok(());
        }
        let offline = !matches!(report.internet, InternetStatus::Online);

        let mut conn = self.lock();
        let was_offline = conn
            .query_row(
                "SELECT value FROM meta WHERE key = ?1",
                [META_SERVICE_CONNECTION],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .as_deref()
            == Some("lost");

        let tx = conn.transaction()?;

        // We're the ones offline. Record the drop once on the way in, then stop —
        // the per-service state stays frozen at its pre-outage values.
        if offline {
            if !was_offline {
                Self::insert_service_event(
                    &tx,
                    &ServiceEvent::Connection { status: ConnectionChange::Lost, ts: now_ms },
                )?;
                Self::set_service_connection(&tx, "lost")?;
                Self::prune_service_events(&tx, now_ms)?;
                tx.commit()?;
            }
            return Ok(());
        }

        let mut events: Vec<ServiceEvent> = Vec::new();

        // Back online after a recorded drop: close it before resuming per-service
        // diffing, so the timeline reads as one outage rather than a gap.
        if was_offline {
            events.push(ServiceEvent::Connection { status: ConnectionChange::Restored, ts: now_ms });
            Self::set_service_connection(&tx, "restored")?;
        }

        let previous = Self::service_state(&tx)?;
        let up_count = report
            .services
            .iter()
            .filter(|svc| Self::reachability_status(svc) == ServiceStatus::Up)
            .count() as i64;

        // Baseline: anchor a brand-new timeline with a positive summary rather
        // than leaving it blank until something first breaks.
        if Self::service_events_is_empty(&tx)? && up_count > 0 {
            events.push(ServiceEvent::Running { count: up_count, ts: now_ms });
        }

        let previously_any_down = previous.values().any(|s| *s == ServiceStatus::Down);
        let mut now_any_down = false;
        let mut recovered = false;

        for svc in &report.services {
            let status = Self::reachability_status(svc);
            if status == ServiceStatus::Down {
                now_any_down = true;
            }
            // A host we've never seen counts as "not down", so a service that has
            // been fine since first sight records nothing.
            let prev = previous.get(&svc.host).copied();
            let changed = match status {
                ServiceStatus::Down => prev != Some(ServiceStatus::Down),
                ServiceStatus::Up => prev == Some(ServiceStatus::Down),
            };
            if changed {
                events.push(ServiceEvent::Transition {
                    host: svc.host.clone(),
                    name: svc.name.clone(),
                    status,
                    ts: now_ms,
                });
                if status == ServiceStatus::Up {
                    recovered = true;
                }
            }
            Self::set_service_state(&tx, &svc.host, status)?;
        }

        // Full recovery: something had been down, and now nothing is.
        if recovered && previously_any_down && !now_any_down {
            events.push(ServiceEvent::Running { count: up_count, ts: now_ms });
        }

        if events.is_empty() {
            // Still commit: the per-host state rows above may have seeded hosts
            // seen for the first time, and dropping that would re-seed forever.
            tx.commit()?;
            return Ok(());
        }
        for event in &events {
            Self::insert_service_event(&tx, event)?;
        }
        Self::prune_service_events(&tx, now_ms)?;
        tx.commit()?;
        Ok(())
    }

    /// A service reads as down when the network path failed (no TLS handshake, so
    /// no latency) or the host answered but is erroring. Mirrors the verdict the
    /// Services page renders, so the timeline never disagrees with the live list.
    fn reachability_status(svc: &crate::types::ServiceReachability) -> crate::types::ServiceStatus {
        use crate::types::ServiceStatus;
        match (svc.latency_ms, svc.http_status) {
            (None, _) => ServiceStatus::Down,
            (_, Some(status)) if status >= 500 => ServiceStatus::Down,
            _ => ServiceStatus::Up,
        }
    }

    fn set_service_connection(conn: &Connection, value: &str) -> rusqlite::Result<()> {
        conn.execute(
            "INSERT INTO meta (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![META_SERVICE_CONNECTION, value],
        )?;
        Ok(())
    }

    fn set_service_state(
        conn: &Connection,
        host: &str,
        status: crate::types::ServiceStatus,
    ) -> rusqlite::Result<()> {
        conn.execute(
            "INSERT INTO service_state (host, status) VALUES (?1, ?2)
             ON CONFLICT(host) DO UPDATE SET status = excluded.status",
            params![host, Self::status_str(status)],
        )?;
        Ok(())
    }

    /// The last known status per host. A host absent from the map has never been
    /// seen, which the diff reads as "not currently down".
    fn service_state(
        conn: &Connection,
    ) -> rusqlite::Result<std::collections::HashMap<String, crate::types::ServiceStatus>> {
        use crate::types::ServiceStatus;
        let mut stmt = conn.prepare("SELECT host, status FROM service_state")?;
        let rows = stmt.query_map([], |row| {
            let host: String = row.get(0)?;
            let status: String = row.get(1)?;
            Ok((host, if status == "down" { ServiceStatus::Down } else { ServiceStatus::Up }))
        })?;
        rows.collect()
    }

    fn status_str(status: crate::types::ServiceStatus) -> &'static str {
        match status {
            crate::types::ServiceStatus::Up => "up",
            crate::types::ServiceStatus::Down => "down",
        }
    }

    fn service_events_is_empty(conn: &Connection) -> rusqlite::Result<bool> {
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM service_events", [], |row| row.get(0))?;
        Ok(count == 0)
    }

    fn insert_service_event(
        conn: &Connection,
        event: &crate::types::ServiceEvent,
    ) -> rusqlite::Result<()> {
        use crate::types::{ConnectionChange, ServiceEvent};
        match event {
            ServiceEvent::Transition { host, name, status, ts } => conn.execute(
                "INSERT INTO service_events (ts, type, host, name, status)
                 VALUES (?1, 'transition', ?2, ?3, ?4)",
                params![ts, host, name, Self::status_str(*status)],
            )?,
            ServiceEvent::Running { count, ts } => conn.execute(
                "INSERT INTO service_events (ts, type, count) VALUES (?1, 'running', ?2)",
                params![ts, count],
            )?,
            ServiceEvent::Connection { status, ts } => conn.execute(
                "INSERT INTO service_events (ts, type, status) VALUES (?1, 'connection', ?2)",
                params![ts, match status {
                    ConnectionChange::Lost => "lost",
                    ConnectionChange::Restored => "restored",
                }],
            )?,
        };
        Ok(())
    }

    fn prune_service_events(conn: &Connection, now_ms: i64) -> rusqlite::Result<()> {
        conn.execute(
            "DELETE FROM service_events WHERE ts < ?1",
            [now_ms - SERVICE_EVENT_RETENTION_MS],
        )?;
        conn.execute(
            "DELETE FROM service_events WHERE id NOT IN
                (SELECT id FROM service_events ORDER BY ts DESC, id DESC LIMIT ?1)",
            [SERVICE_EVENT_LIMIT],
        )?;
        Ok(())
    }

    /// The services timeline, newest first.
    pub fn service_events(&self) -> rusqlite::Result<Vec<crate::types::ServiceEvent>> {
        use crate::types::{ConnectionChange, ServiceEvent, ServiceStatus};
        let conn = self.lock();
        let mut stmt = conn.prepare(
            "SELECT ts, type, host, name, status, count FROM service_events
             ORDER BY ts DESC, id DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            let ts: i64 = row.get(0)?;
            let kind: String = row.get(1)?;
            let host: Option<String> = row.get(2)?;
            let name: Option<String> = row.get(3)?;
            let status: Option<String> = row.get(4)?;
            let count: Option<i64> = row.get(5)?;
            Ok(match kind.as_str() {
                "running" => Some(ServiceEvent::Running { count: count.unwrap_or(0), ts }),
                "connection" => Some(ServiceEvent::Connection {
                    status: if status.as_deref() == Some("lost") {
                        ConnectionChange::Lost
                    } else {
                        ConnectionChange::Restored
                    },
                    ts,
                }),
                // A transition needs both a host and a label to render; a row
                // missing either is corrupt, so drop it rather than invent one.
                "transition" => match (host, name) {
                    (Some(host), Some(name)) => Some(ServiceEvent::Transition {
                        host,
                        name,
                        status: if status.as_deref() == Some("down") {
                            ServiceStatus::Down
                        } else {
                            ServiceStatus::Up
                        },
                        ts,
                    }),
                    _ => None,
                },
                _ => None,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?.into_iter().flatten().collect())
    }

    /// Drop the timeline and the baseline it diffs against. Clearing the state
    /// too means the next probe re-seeds from scratch — otherwise a service
    /// currently down would never log its `down` again, having "already" been
    /// down as far as the baseline knew.
    pub fn clear_service_events(&self) -> rusqlite::Result<()> {
        let mut conn = self.lock();
        let tx = conn.transaction()?;
        tx.execute("DELETE FROM service_events", [])?;
        tx.execute("DELETE FROM service_state", [])?;
        tx.execute("DELETE FROM meta WHERE key = ?1", [META_SERVICE_CONNECTION])?;
        tx.commit()?;
        Ok(())
    }

    /// Whether the feed has never held an event — true only before the first
    /// baseline scan writes its summary row.
    fn events_is_empty(conn: &Connection) -> rusqlite::Result<bool> {
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM network_events", [], |row| row.get(0))?;
        Ok(count == 0)
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
    fn known_name(device: &KnownDevice) -> Option<String> {
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

    fn record_event(
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
    fn record_event_raw(
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
    fn prune_events(conn: &Connection, now_ms: i64) -> rusqlite::Result<()> {
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
                randomized,
            })
        })?;
        rows.collect()
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
                if !d.reachable {
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
                reachable: false,
                last_seen: Some(kd.last_seen),
            });
        }
        Ok(merged)
    }

    // ---- reachability services --------------------------------------------

    /// The user's service list, in display order.
    pub fn services(&self) -> rusqlite::Result<Vec<ServiceDef>> {
        let conn = self.lock();
        let mut stmt = conn.prepare("SELECT name, host FROM services ORDER BY position, rowid")?;
        let rows = stmt.query_map([], |row| {
            Ok(ServiceDef { name: row.get(0)?, host: row.get(1)? })
        })?;
        rows.collect()
    }

    /// Append a service (or, on a host that's already listed, rename it in place
    /// rather than duplicating). Returns the updated list.
    pub fn add_service(&self, name: &str, host: &str) -> rusqlite::Result<Vec<ServiceDef>> {
        {
            let conn = self.lock();
            let next: i64 = conn.query_row(
                "SELECT COALESCE(MAX(position), -1) + 1 FROM services",
                [],
                |row| row.get(0),
            )?;
            conn.execute(
                "INSERT INTO services (host, name, position) VALUES (?1, ?2, ?3)
                 ON CONFLICT(host) DO UPDATE SET name = excluded.name",
                params![host, name, next],
            )?;
        }
        self.services()
    }

    /// Remove the service with `host` (a no-op if it isn't listed, including a
    /// removed default). Returns the updated list.
    pub fn delete_service(&self, host: &str) -> rusqlite::Result<Vec<ServiceDef>> {
        {
            let conn = self.lock();
            conn.execute("DELETE FROM services WHERE host = ?1", params![host])?;
        }
        self.services()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(ts: i64) -> SpeedHistoryRecord {
        SpeedHistoryRecord {
            timestamp: ts,
            download_mbps: 100.0,
            upload_mbps: 20.0,
            latency_ms: 15.0,
            jitter_ms: 2.0,
            packet_loss: 0.0,
            connection_type: "wifi".into(),
            network_name: Some("Home".into()),
            link_speed_mbps: Some(866.0),
            frequency: Some(5180.0),
        }
    }

    #[test]
    fn speed_history_is_newest_first_and_capped() {
        let store = Store::open_in_memory().unwrap();
        for i in 0..(SPEED_HISTORY_LIMIT + 5) {
            store.insert_speed(&sample(i)).unwrap();
        }
        let rows = store.speed_history().unwrap();
        assert_eq!(rows.len() as i64, SPEED_HISTORY_LIMIT);
        assert_eq!(rows[0].timestamp, SPEED_HISTORY_LIMIT + 4);
        // Link speed and band round-trip through the v2 columns.
        assert_eq!(rows[0].link_speed_mbps, Some(866.0));
        assert_eq!(rows[0].frequency, Some(5180.0));
        store.clear_speed_history().unwrap();
        assert!(store.speed_history().unwrap().is_empty());
    }

    #[test]
    fn heals_v2_db_that_a_parallel_branch_created_without_the_new_columns() {
        // Reproduce a DB stamped user_version = 2 by a different branch: it has
        // bufferbloat_ms but not link_speed_mbps/frequency. Opening it must add
        // the missing columns so inserts and reads work instead of erroring with
        // "no such column".
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE speed_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER NOT NULL,
                download_mbps REAL NOT NULL,
                upload_mbps REAL NOT NULL,
                latency_ms REAL NOT NULL,
                jitter_ms REAL NOT NULL,
                packet_loss REAL NOT NULL,
                connection_type TEXT NOT NULL,
                network_name TEXT,
                bufferbloat_ms REAL
            );
            PRAGMA user_version = 2;",
        )
        .unwrap();

        let store = Store::from_connection(conn).unwrap();
        store.insert_speed(&sample(1)).unwrap();
        let rows = store.speed_history().unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].link_speed_mbps, Some(866.0));
        assert_eq!(rows[0].frequency, Some(5180.0));
    }

    #[test]
    fn services_are_seeded_and_editable() {
        let store = Store::open_in_memory().unwrap();

        // Fresh DBs come pre-seeded with the defaults, in order.
        let seeded = store.services().unwrap();
        assert_eq!(seeded.len(), DEFAULT_SERVICES.len());
        assert_eq!(seeded[0].host, "google.com");

        // Adding appends to the end.
        let after_add = store.add_service("Example", "example.com").unwrap();
        assert_eq!(after_add.last().unwrap().host, "example.com");
        assert_eq!(after_add.len(), DEFAULT_SERVICES.len() + 1);

        // Re-adding an existing host renames it in place, no duplicate.
        let renamed = store.add_service("Ex", "example.com").unwrap();
        assert_eq!(renamed.len(), after_add.len());
        let example: Vec<_> = renamed.iter().filter(|s| s.host == "example.com").collect();
        assert_eq!(example.len(), 1);
        assert_eq!(example[0].name, "Ex");

        // Deleting a built-in default sticks (and isn't re-seeded on re-migrate).
        store.delete_service("google.com").unwrap();
        store.migrate().unwrap();
        assert!(store.services().unwrap().iter().all(|s| s.host != "google.com"));
    }

    #[test]
    fn usage_accumulates_and_prunes() {
        let store = Store::open_in_memory().unwrap();
        assert!(store.usage_is_empty().unwrap());
        store.add_usage("2026-01-01", 10, 5).unwrap();
        store.add_usage("2026-01-01", 3, 2).unwrap();
        assert_eq!(store.usage_day("2026-01-01").unwrap(), (13, 7));
        assert_eq!(store.usage_day("2026-01-02").unwrap(), (0, 0));
        store.add_usage("2026-01-02", 1, 1).unwrap();
        store.prune_usage(1).unwrap();
        assert_eq!(store.usage_day("2026-01-01").unwrap(), (0, 0));
        assert_eq!(store.usage_day("2026-01-02").unwrap(), (1, 1));
    }

    #[test]
    fn meta_round_trips() {
        let store = Store::open_in_memory().unwrap();
        assert_eq!(store.get_meta_u64("k").unwrap(), None);
        store.set_meta_u64("k", 42).unwrap();
        store.set_meta_u64("k", 43).unwrap();
        assert_eq!(store.get_meta_u64("k").unwrap(), Some(43));
    }

    #[test]
    fn devices_upsert_preserves_first_seen_and_hostname() {
        let store = Store::open_in_memory().unwrap();
        let mut device = LanDevice {
            ip: "192.168.1.5".into(),
            mac: "aa:bb:cc:dd:ee:ff".into(),
            vendor: Some("Acme".into()),
            hostname: Some("nas".into()),
            model: None,
            os: None,
            kind: "computer".into(),
            kind_confidence: "high",
            is_randomized_mac: false,
            is_gateway: false,
            is_self: false,
            reachable: true,
            last_seen: None,
        };
        store.record_devices(std::slice::from_ref(&device), 1000).unwrap();
        device.hostname = None; // a later scan that couldn't resolve the name
        device.ip = "192.168.1.9".into();
        store.record_devices(std::slice::from_ref(&device), 2000).unwrap();

        let known = store.known_devices().unwrap();
        assert_eq!(known.len(), 1);
        assert_eq!(known[0].first_seen, 1000);
        assert_eq!(known[0].last_seen, 2000);
        assert_eq!(known[0].ip.as_deref(), Some("192.168.1.9"));
        assert_eq!(known[0].hostname.as_deref(), Some("nas"));
    }

    #[test]
    fn a_silent_scan_does_not_erase_a_known_kind() {
        let store = Store::open_in_memory().unwrap();
        let mut phone = device("bb:bb:bb:bb:bb:bb", "192.168.2.14", "phone");
        phone.os = Some("Android".into());
        store.record_devices(std::slice::from_ref(&phone), 1_000).unwrap();

        // A later scan can't classify it (asleep, announcing nothing) so it comes
        // back as a bare unknown. The remembered "phone"/"Android" must survive.
        let mut silent = device("bb:bb:bb:bb:bb:bb", "192.168.2.14", "unknown");
        silent.os = None;
        store.record_devices(std::slice::from_ref(&silent), 2_000).unwrap();

        let known = store.known_devices().unwrap();
        assert_eq!(known[0].kind, "phone", "a failed classify keeps the settled kind");
        assert_eq!(known[0].os.as_deref(), Some("Android"), "and the stored OS");
    }

    #[test]
    fn an_unreachable_live_device_keeps_its_last_known_identity() {
        let store = Store::open_in_memory().unwrap();
        let mut phone = device("bb:bb:bb:bb:bb:bb", "192.168.2.14", "phone");
        phone.os = Some("Android".into());
        phone.hostname = Some("Janes-Phone".into());
        store.record_devices(std::slice::from_ref(&phone), 1_000).unwrap();

        // Still in the ARP table but no longer answering — the fresh scan rebuilt
        // it as a bare "Generic device" (no hostname/os, kind unknown). The merge
        // must restore its remembered identity rather than surface the bare row.
        let mut silent = device("bb:bb:bb:bb:bb:bb", "192.168.2.14", "unknown");
        silent.hostname = None;
        silent.os = None;
        silent.reachable = false;
        store.record_devices(std::slice::from_ref(&silent), 2_000).unwrap();

        let merged =
            store.devices_with_offline(std::slice::from_ref(&silent), 2_000, OFFLINE_LIST_KEEP_MS).unwrap();
        let row = merged.iter().find(|d| d.mac == "bb:bb:bb:bb:bb:bb").unwrap();
        assert!(!row.reachable, "it still reads offline");
        assert_eq!(row.kind, "phone", "with its remembered kind, not unknown");
        assert_eq!(row.os.as_deref(), Some("Android"), "its remembered OS");
        assert_eq!(row.hostname.as_deref(), Some("Janes-Phone"), "and its remembered name");
    }

    #[test]
    fn an_offline_row_with_an_unknown_kind_is_not_guessed_from_the_vendor() {
        // The complement to the preservation tests: when the stored kind really is
        // "unknown" — a randomized-MAC device we only ever pinned to a vendor
        // ("Apple") — the offline row must stay Unknown, not be guessed into a
        // "phone" from the vendor alone. An Apple host could be a Mac, iPad, TV or
        // watch; we surface only what we actually identified.
        let store = Store::open_in_memory().unwrap();
        let mut vendor_only = device("ae:4a:06:fe:b5:37", "192.168.2.14", "unknown");
        vendor_only.vendor = Some("Apple".into());
        vendor_only.is_randomized_mac = true;
        store.record_devices(std::slice::from_ref(&vendor_only), 1_000).unwrap();

        let merged = store.devices_with_offline(&[], 2_000, OFFLINE_LIST_KEEP_MS).unwrap();
        let row = merged.iter().find(|d| d.mac == "ae:4a:06:fe:b5:37").unwrap();
        assert_eq!(row.vendor.as_deref(), Some("Apple"), "the vendor is remembered");
        assert_eq!(row.kind, "unknown", "but the kind is not invented from it");
    }

    fn device(mac: &str, ip: &str, kind: &str) -> LanDevice {
        LanDevice {
            ip: ip.into(),
            mac: mac.into(),
            vendor: None,
            hostname: None,
            model: None,
            os: None,
            kind: kind.into(),
            kind_confidence: "high",
            is_randomized_mac: false,
            is_gateway: false,
            is_self: false,
            reachable: true,
            last_seen: None,
        }
    }

    #[test]
    fn derives_join_change_offline_and_gateway_events() {
        let store = Store::open_in_memory().unwrap();
        let mut gw = device("00:00:00:00:00:01", "192.168.1.1", "router");
        gw.is_gateway = true;
        let phone = device("aa:aa:aa:aa:aa:aa", "192.168.1.20", "phone");

        // First scan seeds the feed with a single baseline summary ("2 devices"),
        // not a per-device burst.
        store.record_devices(&[gw.clone(), phone.clone()], 1_000).unwrap();
        let seeded = store.network_events(100).unwrap();
        assert_eq!(seeded.len(), 1);
        assert_eq!(seeded[0].event_type, "initial_scan");
        assert_eq!(seeded[0].new_value.as_deref(), Some("2"));

        // A new laptop arrives → one join event, on top of the baseline.
        let mut laptop = device("bb:bb:bb:bb:bb:bb", "192.168.1.30", "computer");
        laptop.hostname = Some("laptop-01".into());
        store
            .record_devices(&[gw.clone(), phone.clone(), laptop.clone()], 2_000)
            .unwrap();
        let latest = store.network_events(1).unwrap();
        assert_eq!(latest[0].event_type, "device_joined");
        assert_eq!(latest[0].mac.as_deref(), Some("bb:bb:bb:bb:bb:bb"));

        // The laptop reports a new hostname → no event (renames were too noisy,
        // so identity changes no longer surface at all).
        let mut renamed = laptop.clone();
        renamed.hostname = Some("laptop-02".into());
        let before_rename = store.network_events(100).unwrap().len();
        store
            .record_devices(&[gw.clone(), phone.clone(), renamed.clone()], 3_000)
            .unwrap();
        assert_eq!(
            store.network_events(100).unwrap().len(),
            before_rename,
            "hostname changes are silent now"
        );

        // A plain IP change now produces no event.
        let mut moved = renamed.clone();
        moved.ip = "192.168.1.31".into();
        let before = store.network_events(100).unwrap().len();
        store
            .record_devices(&[gw.clone(), phone.clone(), moved.clone()], 3_500)
            .unwrap();
        assert_eq!(store.network_events(100).unwrap().len(), before, "IP changes are silent now");

        // The laptop drops off (still within the offline-recency window) → offline.
        store.record_devices(&[gw.clone(), phone.clone()], 4_000).unwrap();
        assert_eq!(store.network_events(1).unwrap()[0].event_type, "device_offline");

        // …and returns → online, not a fresh join.
        store
            .record_devices(&[gw.clone(), phone.clone(), moved.clone()], 5_000)
            .unwrap();
        assert_eq!(store.network_events(1).unwrap()[0].event_type, "device_online");

        // The gateway's MAC changes under us → a critical gateway_changed.
        let mut gw2 = gw.clone();
        gw2.mac = "00:00:00:00:00:02".into();
        store
            .record_devices(&[gw2, phone.clone(), moved.clone()], 6_000)
            .unwrap();
        let latest = &store.network_events(1).unwrap()[0];
        assert_eq!(latest.event_type, "gateway_changed");
        assert_eq!(latest.severity, "critical");
    }

    #[test]
    fn touch_devices_no_ops_until_an_active_scan_seeds_the_roster() {
        let store = Store::open_in_memory().unwrap();
        let seen = device("aa:aa:aa:aa:aa:aa", "192.168.1.10", "unknown");
        // No baseline yet: a passive pass must not seed the roster (that's the
        // first active scan's job), or that scan would report every silent host
        // it finds as a fresh arrival.
        store.touch_devices(std::slice::from_ref(&seen), 1_000).unwrap();
        assert!(store.known_devices().unwrap().is_empty());
        assert!(store.network_events(100).unwrap().is_empty());
    }

    #[test]
    fn touch_devices_bumps_last_seen_without_touching_identity() {
        let store = Store::open_in_memory().unwrap();
        let mut phone = device("bb:bb:bb:bb:bb:bb", "192.168.2.14", "phone");
        phone.hostname = Some("Janes-Phone".into());
        phone.vendor = Some("Apple".into());
        store.record_devices(std::slice::from_ref(&phone), 1_000).unwrap();

        // A passive sighting carries only thin evidence (no hostname, kind
        // unknown). It must advance last_seen/ip yet leave the richer identity an
        // active scan resolved exactly as it was.
        let mut passive = device("bb:bb:bb:bb:bb:bb", "192.168.2.20", "unknown");
        passive.hostname = None;
        passive.vendor = None;
        store.touch_devices(std::slice::from_ref(&passive), 5_000).unwrap();

        let known = store.known_devices().unwrap();
        assert_eq!(known.len(), 1);
        assert_eq!(known[0].last_seen, 5_000, "last_seen advances");
        assert_eq!(known[0].ip.as_deref(), Some("192.168.2.20"), "and so does the IP");
        assert_eq!(known[0].hostname.as_deref(), Some("Janes-Phone"), "identity untouched");
        assert_eq!(known[0].kind, "phone");
        assert_eq!(known[0].vendor.as_deref(), Some("Apple"));
    }

    #[test]
    fn touch_devices_never_marks_an_absent_device_offline() {
        let store = Store::open_in_memory().unwrap();
        let a = device("aa:aa:aa:aa:aa:aa", "192.168.1.10", "phone");
        let b = device("bb:bb:bb:bb:bb:bb", "192.168.1.11", "computer");
        store.record_devices(&[a.clone(), b.clone()], 1_000).unwrap(); // baseline
        let before = store.network_events(100).unwrap().len();

        // A passive pass that only saw `a` must not declare `b` gone — passive
        // discovery can't prove absence, so it only ever adds presence.
        store.touch_devices(std::slice::from_ref(&a), 2_000).unwrap();
        let events = store.network_events(100).unwrap();
        assert_eq!(events.len(), before, "no event for the device it didn't see");
        assert!(events.iter().all(|e| e.event_type != "device_offline"));
    }

    #[test]
    fn touch_devices_re_flags_a_returning_device_online() {
        let store = Store::open_in_memory().unwrap();
        let a = device("aa:aa:aa:aa:aa:aa", "192.168.1.10", "phone");
        let b = device("bb:bb:bb:bb:bb:bb", "192.168.1.11", "computer");
        store.record_devices(&[a.clone(), b.clone()], 1_000).unwrap(); // baseline
        store.record_devices(std::slice::from_ref(&a), 2_000).unwrap(); // b drops → offline
        assert_eq!(store.network_events(1).unwrap()[0].event_type, "device_offline");

        // b is seen again by a passive pass → an online transition still lands on
        // the feed even though no active scan ran.
        store.touch_devices(std::slice::from_ref(&b), 3_000).unwrap();
        assert_eq!(store.network_events(1).unwrap()[0].event_type, "device_online");
    }

    #[test]
    fn touch_devices_records_a_genuinely_new_arrival() {
        let store = Store::open_in_memory().unwrap();
        let a = device("aa:aa:aa:aa:aa:aa", "192.168.1.10", "phone");
        store.record_devices(std::slice::from_ref(&a), 1_000).unwrap(); // baseline exists

        // A device that joined while the app sat in the tray, caught passively.
        let mut newcomer = device("cc:cc:cc:cc:cc:cc", "192.168.1.42", "unknown");
        newcomer.hostname = Some("new-tv".into());
        store.touch_devices(std::slice::from_ref(&newcomer), 2_000).unwrap();

        assert!(
            store.known_devices().unwrap().iter().any(|d| d.mac == "cc:cc:cc:cc:cc:cc"),
            "the arrival is recorded"
        );
        assert_eq!(store.network_events(1).unwrap()[0].event_type, "device_joined");
    }

    #[test]
    fn touch_devices_flags_a_new_router_as_an_ap_appeared_warning() {
        let store = Store::open_in_memory().unwrap();
        let baseline = device("aa:aa:aa:aa:aa:aa", "192.168.1.10", "phone");
        store.record_devices(std::slice::from_ref(&baseline), 1_000).unwrap();

        // A router-kind arrival caught passively (the classify pass typed it as a
        // router, not left it unknown) must land as the higher-severity
        // ap_appeared warning, not a plain join.
        let ap = device("dd:dd:dd:dd:dd:dd", "192.168.1.2", "router");
        store.touch_devices(std::slice::from_ref(&ap), 2_000).unwrap();
        let latest = &store.network_events(1).unwrap()[0];
        assert_eq!(latest.event_type, "ap_appeared");
        assert_eq!(latest.severity, "warning");
    }

    #[test]
    fn offline_is_not_re_emitted_and_stale_devices_never_fire() {
        let store = Store::open_in_memory().unwrap();
        let a = device("aa:aa:aa:aa:aa:aa", "192.168.1.10", "phone");
        let b = device("bb:bb:bb:bb:bb:bb", "192.168.1.11", "computer");

        store.record_devices(&[a.clone(), b.clone()], 1_000).unwrap(); // baseline
        store.record_devices(&[a.clone()], 2_000).unwrap(); // b drops → offline
        store.record_devices(&[a.clone()], 3_000).unwrap(); // still gone → no repeat
        let offline: Vec<_> = store
            .network_events(100)
            .unwrap()
            .into_iter()
            .filter(|e| e.event_type == "device_offline")
            .collect();
        assert_eq!(offline.len(), 1, "offline should fire once, not every scan");

        // A device last seen long ago (beyond the recency window) is the
        // historical roster, not a fresh drop — a scan without it stays quiet.
        let stale = device("cc:cc:cc:cc:cc:cc", "192.168.1.12", "tv");
        let long_ago = 10_000;
        store.record_devices(&[a.clone(), stale], long_ago).unwrap();
        let much_later = long_ago + OFFLINE_RECENCY_MS + 60_000;
        let before = store.network_events(100).unwrap().len();
        store.record_devices(&[a], much_later).unwrap();
        assert_eq!(
            store.network_events(100).unwrap().len(),
            before,
            "a device beyond the recency window must not emit an offline event"
        );
    }

    #[test]
    fn an_offline_scan_does_not_fire_a_departure_for_every_device() {
        let store = Store::open_in_memory().unwrap();
        let mut gw = device("00:00:00:00:00:01", "192.168.1.1", "router");
        gw.is_gateway = true;
        let phone = device("aa:aa:aa:aa:aa:aa", "192.168.1.20", "phone");
        let laptop = device("bb:bb:bb:bb:bb:bb", "192.168.1.30", "computer");

        store.record_devices(&[gw.clone(), phone.clone(), laptop.clone()], 1_000).unwrap(); // baseline

        // Going offline: the scan confirms nobody — not even self or the gateway
        // (all unreachable). Model that as the stale roster with reachable=false,
        // which is what a scan yields with no uplink. No per-device offline burst
        // should fire — the machine left, the LAN didn't empty out.
        let offline_scan: Vec<LanDevice> = [gw, phone, laptop]
            .into_iter()
            .map(|mut d| {
                d.reachable = false;
                d
            })
            .collect();
        store.record_devices(&offline_scan, 2_000).unwrap();

        let offline = store
            .network_events(100)
            .unwrap()
            .into_iter()
            .filter(|e| e.event_type == "device_offline")
            .count();
        assert_eq!(offline, 0, "an offline scan must not mark every device departed");

        // Back online — everyone answers again. They were never marked offline, so
        // there's no spurious reconnect flurry either.
        let back = [
            device("00:00:00:00:00:01", "192.168.1.1", "router"),
            device("aa:aa:aa:aa:aa:aa", "192.168.1.20", "phone"),
            device("bb:bb:bb:bb:bb:bb", "192.168.1.30", "computer"),
        ];
        store.record_devices(&back, 3_000).unwrap();
        let online = store
            .network_events(100)
            .unwrap()
            .into_iter()
            .filter(|e| e.event_type == "device_online")
            .count();
        assert_eq!(online, 0, "devices that were never marked offline don't 'reconnect'");
    }

    #[test]
    fn a_disconnected_host_does_not_fire_departures_for_peers() {
        // The macOS case behind the flood: when the uplink drops, a scan still
        // enumerates `self` as reachable, so `live` is non-empty and the
        // empty-scan guard alone misses it. The host's recorded connection state
        // (`disconnected`) must suppress the per-device offline burst — only the
        // single `connection_lost` event should stand in for the drop.
        let store = Store::open_in_memory().unwrap();
        store.record_connection("wifi", Some("home"), None, None, None, 500).unwrap();
        let mut me = device("00:00:00:00:00:0a", "192.168.1.5", "computer");
        me.is_self = true;
        let phone = device("aa:aa:aa:aa:aa:aa", "192.168.1.20", "phone");
        let laptop = device("bb:bb:bb:bb:bb:bb", "192.168.1.30", "computer");

        store
            .record_devices(&[me.clone(), phone.clone(), laptop.clone()], 1_000)
            .unwrap(); // baseline

        // Uplink drops: the host is now disconnected, and the next scan sees only
        // self (still reachable), with the real peers gone unreachable.
        store.record_connection("disconnected", None, None, None, None, 2_000).unwrap();
        let phone_gone = LanDevice { reachable: false, ..phone };
        let laptop_gone = LanDevice { reachable: false, ..laptop };
        store.record_devices(&[me, phone_gone, laptop_gone], 3_000).unwrap();

        let offline = store
            .network_events(100)
            .unwrap()
            .into_iter()
            .filter(|e| e.event_type == "device_offline")
            .count();
        assert_eq!(offline, 0, "a disconnected host must not mark its peers departed");
    }

    #[test]
    fn a_real_departure_still_fires_when_others_remain_reachable() {
        // The guard keys on *nothing* being reachable. As long as at least one
        // device answered (here the gateway), a genuinely absent device is still a
        // real departure and must fire — the offline suppression must not swallow it.
        let store = Store::open_in_memory().unwrap();
        let mut gw = device("00:00:00:00:00:01", "192.168.1.1", "router");
        gw.is_gateway = true;
        let phone = device("aa:aa:aa:aa:aa:aa", "192.168.1.20", "phone");

        store.record_devices(&[gw.clone(), phone.clone()], 1_000).unwrap(); // baseline
        store.record_devices(&[gw], 2_000).unwrap(); // phone leaves, gateway stays
        let latest = &store.network_events(1).unwrap()[0];
        assert_eq!(latest.event_type, "device_offline");
        assert_eq!(latest.mac.as_deref(), Some("aa:aa:aa:aa:aa:aa"));
    }

    #[test]
    fn devices_with_offline_keeps_recent_departures_and_drops_stale_ones() {
        let store = Store::open_in_memory().unwrap();
        let here = device("aa:aa:aa:aa:aa:aa", "192.168.1.10", "computer");
        let recent = device("bb:bb:bb:bb:bb:bb", "192.168.1.20", "phone");
        let ancient = device("cc:cc:cc:cc:cc:cc", "192.168.1.30", "tv");

        // Seed the roster: the TV was last seen two days ago, the phone a minute
        // ago, and the computer is here now.
        let now = 3 * OFFLINE_LIST_KEEP_MS; // comfortably past both timestamps
        store.record_devices(&[ancient], now - 2 * OFFLINE_LIST_KEEP_MS).unwrap();
        store.record_devices(&[recent.clone()], now - 60_000).unwrap();
        store.record_devices(&[here.clone()], now).unwrap();

        // Only the computer answered this scan; merge fills in the phone (recent)
        // but not the TV (beyond the 24h window).
        let merged = store.devices_with_offline(&[here.clone()], now, OFFLINE_LIST_KEEP_MS).unwrap();
        let by_mac = |m: &str| merged.iter().find(|d| d.mac == m).cloned();

        let online = by_mac("aa:aa:aa:aa:aa:aa").unwrap();
        assert!(online.reachable, "the live device stays reachable");
        assert_eq!(online.last_seen, Some(now), "and is stamped with this scan");

        let offline = by_mac("bb:bb:bb:bb:bb:bb").expect("recent departure is kept");
        assert!(!offline.reachable, "a merged roster device reads offline");
        assert_eq!(offline.kind, "phone", "carrying its stored identity");
        assert_eq!(offline.last_seen, Some(now - 60_000), "with its real last-seen time");

        assert!(by_mac("cc:cc:cc:cc:cc:cc").is_none(), "a device gone > 24h drops off the list");
        assert!(store.known_devices().unwrap().iter().any(|k| k.mac == "cc:cc:cc:cc:cc:cc"),
            "but its roster row is retained in the DB");
    }

    #[test]
    fn a_present_but_unreachable_device_goes_offline_on_the_feed() {
        let store = Store::open_in_memory().unwrap();
        let keep = device("aa:aa:aa:aa:aa:aa", "192.168.1.10", "computer");
        let phone = device("bb:bb:bb:bb:bb:bb", "192.168.1.20", "phone");

        store.record_devices(&[keep.clone(), phone.clone()], 1_000).unwrap(); // baseline

        // The phone stops answering probes but is still in the ARP table — it's
        // in the scan with reachable=false ("Offline" in the Devices view). The
        // feed must reflect that, not wait for the device to vanish entirely.
        let mut asleep = phone.clone();
        asleep.reachable = false;
        store.record_devices(&[keep.clone(), asleep.clone()], 2_000).unwrap();

        let latest = &store.network_events(1).unwrap()[0];
        assert_eq!(latest.event_type, "device_offline");
        assert_eq!(latest.mac.as_deref(), Some("bb:bb:bb:bb:bb:bb"));

        // Still present, still unreachable → no second offline, no spurious online.
        store.record_devices(&[keep.clone(), asleep.clone()], 3_000).unwrap();
        let offline_count = store
            .network_events(100)
            .unwrap()
            .iter()
            .filter(|e| e.event_type == "device_offline" && e.mac.as_deref() == Some("bb:bb:bb:bb:bb:bb"))
            .count();
        assert_eq!(offline_count, 1, "offline fires once while it stays unreachable");

        // It answers again → device_online.
        store.record_devices(&[keep.clone(), phone.clone()], 4_000).unwrap();
        assert_eq!(store.network_events(1).unwrap()[0].event_type, "device_online");
    }

    #[test]
    fn a_device_back_in_arp_but_still_silent_is_not_a_reconnect() {
        let store = Store::open_in_memory().unwrap();
        let keep = device("aa:aa:aa:aa:aa:aa", "192.168.1.10", "computer");
        let phone = device("bb:bb:bb:bb:bb:bb", "192.168.1.20", "phone");

        store.record_devices(&[keep.clone(), phone.clone()], 1_000).unwrap(); // baseline
        store.record_devices(&[keep.clone()], 2_000).unwrap(); // vanishes → offline
        assert_eq!(store.network_events(1).unwrap()[0].event_type, "device_offline");

        // Reappears in the ARP table but still isn't answering (reachable=false)
        // → not a reconnect; it stays offline on the feed.
        let mut silent = phone.clone();
        silent.reachable = false;
        let before = store.network_events(100).unwrap().len();
        store.record_devices(&[keep.clone(), silent], 3_000).unwrap();
        assert_eq!(
            store.network_events(100).unwrap().len(),
            before,
            "a silent return is neither a new offline nor an online"
        );
    }

    #[test]
    fn a_departed_randomized_device_keeps_its_live_label() {
        let store = Store::open_in_memory().unwrap();
        let keep = device("aa:aa:aa:aa:aa:aa", "192.168.1.10", "computer");

        // A randomized-MAC phone with no hostname/vendor, but the DHCP
        // fingerprint gave up its OS and the classifier its kind — exactly the
        // signals the live Devices view stitches into "Android phone".
        let mut phone = device("1a:78:49:c6:0d:df", "192.168.1.20", "phone");
        phone.is_randomized_mac = true;
        phone.os = Some("Android".into());

        store.record_devices(&[keep.clone(), phone.clone()], 1_000).unwrap(); // baseline
        store.record_devices(&[keep.clone()], 2_000).unwrap(); // phone drops off

        let offline = &store.network_events(1).unwrap()[0];
        assert_eq!(offline.event_type, "device_offline");
        // The departure carries the same label the device showed while live,
        // instead of a null name the UI would render as "Unknown device"…
        assert_eq!(offline.name.as_deref(), Some("Android phone"));
        // …and the randomized flag survives from the stored row.
        assert!(offline.randomized);
    }

    #[test]
    fn a_vendor_known_device_keeps_its_kind_in_the_name() {
        let store = Store::open_in_memory().unwrap();
        let keep = device("aa:aa:aa:aa:aa:aa", "192.168.1.10", "computer");

        // An Apple phone with a known maker but no hostname — the case where the
        // vendor used to swallow the kind, reading "Apple" instead of "Phone".
        let mut phone = device("1a:78:49:c6:0d:df", "192.168.1.20", "phone");
        phone.vendor = Some("Apple".into());
        phone.is_randomized_mac = true;

        store.record_devices(&[keep.clone(), phone.clone()], 1_000).unwrap(); // baseline
        store.record_devices(&[keep.clone()], 2_000).unwrap(); // phone departs

        let offline = &store.network_events(1).unwrap()[0];
        assert_eq!(offline.event_type, "device_offline");
        assert_eq!(
            offline.name.as_deref(),
            Some("Apple · Phone"),
            "the kind stays beside the maker instead of being replaced by it"
        );
    }

    #[test]
    fn a_departed_anonymous_randomized_device_still_reads_private() {
        let store = Store::open_in_memory().unwrap();
        let keep = device("aa:aa:aa:aa:aa:aa", "192.168.1.10", "computer");

        // Nothing was ever learned — no hostname, vendor, OS, or kind. The name
        // stays null so the UI falls back to "Private device" from the
        // randomized flag, matching how the device read when it joined.
        let mut ghost = device("1a:78:49:c6:0d:df", "192.168.1.20", "unknown");
        ghost.is_randomized_mac = true;

        store.record_devices(&[keep.clone(), ghost.clone()], 1_000).unwrap();
        store.record_devices(&[keep.clone()], 2_000).unwrap();

        let offline = &store.network_events(1).unwrap()[0];
        assert_eq!(offline.event_type, "device_offline");
        assert_eq!(offline.name, None, "no identity to snapshot");
        assert!(offline.randomized, "so the UI can still show 'Private device'");
    }

    #[test]
    fn a_past_offline_relabels_once_the_classifier_catches_up() {
        let store = Store::open_in_memory().unwrap();
        let keep = device("aa:aa:aa:aa:aa:aa", "192.168.1.10", "computer");

        // First sight of a randomized phone is thin — no hostname/vendor/OS and
        // the classifier hasn't committed to a kind. It joins, then drops off,
        // recording an offline row with no identity ("Private device" in the UI).
        let mut thin = device("1a:78:49:c6:0d:df", "192.168.1.20", "unknown");
        thin.is_randomized_mac = true;
        store.record_devices(&[keep.clone(), thin.clone()], 1_000).unwrap(); // baseline
        store.record_devices(&[keep.clone()], 2_000).unwrap(); // drops off, thin

        let offline_id = {
            let e = &store.network_events(1).unwrap()[0];
            assert_eq!(e.event_type, "device_offline");
            assert_eq!(e.name, None, "nothing known yet");
            e.id
        };

        // It returns and this scan's evidence pins it: Android, a phone. The
        // roster now carries that identity…
        let mut pinned = device("1a:78:49:c6:0d:df", "192.168.1.20", "phone");
        pinned.is_randomized_mac = true;
        pinned.os = Some("Android".into());
        store.record_devices(&[keep.clone(), pinned.clone()], 3_000).unwrap();

        // …and the *earlier* offline row now reads the improved label, resolved
        // live against the roster rather than the stale snapshot.
        let offline = store
            .network_events(100)
            .unwrap()
            .into_iter()
            .find(|e| e.id == offline_id)
            .unwrap();
        assert_eq!(offline.name.as_deref(), Some("Android phone"));
        assert!(offline.randomized, "randomized resolves from the roster too");
    }

    #[test]
    fn a_departed_device_keeps_its_snapshot_label() {
        let store = Store::open_in_memory().unwrap();
        let keep = device("aa:aa:aa:aa:aa:aa", "192.168.1.10", "computer");

        // A named laptop joins, then leaves the network for good (beyond any
        // future scan). Its offline row must keep the snapshot label, since the
        // roster row is the only place a live identity could come from.
        let mut laptop = device("bb:bb:bb:bb:bb:bb", "192.168.1.30", "computer");
        laptop.hostname = Some("laptop-01".into());
        store.record_devices(&[keep.clone(), laptop.clone()], 1_000).unwrap(); // baseline
        store.record_devices(&[keep.clone()], 2_000).unwrap(); // laptop departs

        // Forget the departed device, simulating a roster it's no longer part of.
        store.lock().execute("DELETE FROM known_devices WHERE mac = ?1", ["bb:bb:bb:bb:bb:bb"]).unwrap();

        let offline = store
            .network_events(100)
            .unwrap()
            .into_iter()
            .find(|e| e.mac.as_deref() == Some("bb:bb:bb:bb:bb:bb"))
            .unwrap();
        assert_eq!(offline.event_type, "device_offline");
        assert_eq!(offline.name.as_deref(), Some("laptop-01"), "snapshot survives departure");
    }

    #[test]
    fn a_connection_event_keeps_its_ssid_despite_a_matching_mac() {
        let store = Store::open_in_memory().unwrap();

        // The machine's own MAC is in the roster (it's scanned like any device),
        // so a wifi_connected event — which stores the SSID as its `name` and
        // happens to carry that same MAC — must NOT be relabeled to a device
        // name by the roster join.
        let mut selfd = device("aa:bb:cc:dd:ee:ff", "192.168.1.5", "computer");
        selfd.hostname = Some("my-macbook".into());
        selfd.is_self = true;
        store.record_devices(&[selfd.clone()], 500).unwrap();

        // Seed the connection baseline, then transition to a named Wi-Fi network.
        store
            .record_connection("wifi", Some("Home"), Some("wlan0"), Some("192.168.1.5"), Some("aa:bb:cc:dd:ee:ff"), 1_000)
            .unwrap();
        store
            .record_connection("ethernet", None, Some("eth0"), Some("192.168.1.5"), Some("aa:bb:cc:dd:ee:ff"), 1_500)
            .unwrap();
        store
            .record_connection("wifi", Some("Home"), Some("wlan0"), Some("192.168.1.5"), Some("aa:bb:cc:dd:ee:ff"), 2_000)
            .unwrap();

        let wifi = store
            .network_events(100)
            .unwrap()
            .into_iter()
            .find(|e| e.event_type == "wifi_connected")
            .unwrap();
        assert_eq!(wifi.name.as_deref(), Some("Home"), "the SSID must survive the roster join");
    }

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

    #[test]
    fn migrate_scrubs_reverse_dns_error_text_stored_as_hostname() {
        // Seed a DB the way earlier builds left it: a leaked `dig` diagnostic
        // pinned as a device's hostname, alongside a legitimately-named device.
        let conn = Connection::open_in_memory().unwrap();
        let store = Store::from_connection(conn).unwrap();
        store
            .lock()
            .execute_batch(
                "INSERT INTO known_devices (mac, ip, hostname, vendor, kind, first_seen, last_seen)
                 VALUES ('11:11:11:11:11:11', '192.168.2.12',
                         ';; connection timed out; no servers could be reached',
                         NULL, 'unknown', 1, 1),
                        ('22:22:22:22:22:22', '192.168.2.20', 'pixel-7', NULL, 'phone', 1, 1);",
            )
            .unwrap();

        // Re-running migrate() (as a fresh open would) heals the poisoned row.
        store.migrate().unwrap();

        let known = store.known_devices().unwrap();
        let by_mac = |mac: &str| {
            known.iter().find(|d| d.mac == mac).unwrap().hostname.clone()
        };
        assert_eq!(by_mac("11:11:11:11:11:11"), None);
        assert_eq!(by_mac("22:22:22:22:22:22").as_deref(), Some("pixel-7"));
    }

    // --- services timeline -------------------------------------------------

    use crate::types::{
        ConnectionChange, InternetStatus, ServiceEvent, ServiceReachability, ServiceStatus,
        ServicesReport,
    };

    /// A probe batch where every host in `up` answered and every host in `down`
    /// failed its path, with the machine itself online.
    fn report(up: &[&str], down: &[&str]) -> ServicesReport {
        let svc = |host: &str, latency: Option<f64>| ServiceReachability {
            name: host.to_uppercase(),
            host: host.to_string(),
            latency_ms: latency,
            http_status: latency.map(|_| 200),
        };
        ServicesReport {
            internet: InternetStatus::Online,
            services: up
                .iter()
                .map(|h| svc(h, Some(12.0)))
                .chain(down.iter().map(|h| svc(h, None)))
                .collect(),
        }
    }

    #[test]
    fn services_first_sight_logs_a_running_baseline_only() {
        let store = Store::open_in_memory().unwrap();
        store.record_services(&report(&["a.com", "b.com"], &[]), 1_000).unwrap();

        let events = store.service_events().unwrap();
        assert_eq!(events, vec![ServiceEvent::Running { count: 2, ts: 1_000 }]);
    }

    #[test]
    fn services_records_only_crossings_not_every_probe() {
        let store = Store::open_in_memory().unwrap();
        store.record_services(&report(&["a.com"], &[]), 1_000).unwrap();
        // Same verdict three more times — the log must not grow.
        store.record_services(&report(&["a.com"], &[]), 2_000).unwrap();
        store.record_services(&report(&["a.com"], &[]), 3_000).unwrap();

        assert_eq!(store.service_events().unwrap().len(), 1);
    }

    #[test]
    fn services_logs_down_then_up_and_a_recovery_summary() {
        let store = Store::open_in_memory().unwrap();
        store.record_services(&report(&["a.com", "b.com"], &[]), 1_000).unwrap();
        store.record_services(&report(&["a.com"], &["b.com"]), 2_000).unwrap();
        store.record_services(&report(&["a.com", "b.com"], &[]), 3_000).unwrap();

        // Newest first: recovery summary, b back up, b went down, baseline.
        let events = store.service_events().unwrap();
        assert_eq!(events.len(), 4);
        assert_eq!(events[0], ServiceEvent::Running { count: 2, ts: 3_000 });
        assert!(matches!(
            &events[1],
            ServiceEvent::Transition { host, status: ServiceStatus::Up, ts: 3_000, .. } if host == "b.com"
        ));
        assert!(matches!(
            &events[2],
            ServiceEvent::Transition { host, status: ServiceStatus::Down, ts: 2_000, .. } if host == "b.com"
        ));
    }

    #[test]
    fn our_own_outage_logs_one_connection_drop_not_a_wall_of_downs() {
        let store = Store::open_in_memory().unwrap();
        store.record_services(&report(&["a.com", "b.com"], &[]), 1_000).unwrap();

        // We go offline: every probe fails at once. That's ours, not theirs.
        let mut offline = report(&[], &["a.com", "b.com"]);
        offline.internet = InternetStatus::Offline;
        store.record_services(&offline, 2_000).unwrap();
        store.record_services(&offline, 3_000).unwrap();

        let events = store.service_events().unwrap();
        assert_eq!(events[0], ServiceEvent::Connection { status: ConnectionChange::Lost, ts: 2_000 });
        // Only the drop and the original baseline — no per-service downs, and the
        // second offline probe adds nothing.
        assert_eq!(events.len(), 2);

        // Back online, unchanged services: the drop closes, and the frozen state
        // means no phantom "recovery" for services that never actually fell.
        store.record_services(&report(&["a.com", "b.com"], &[]), 4_000).unwrap();
        let events = store.service_events().unwrap();
        assert_eq!(
            events[0],
            ServiceEvent::Connection { status: ConnectionChange::Restored, ts: 4_000 }
        );
        assert_eq!(events.len(), 3);
    }

    #[test]
    fn a_service_erroring_5xx_counts_as_down_even_though_the_path_is_up() {
        let store = Store::open_in_memory().unwrap();
        store.record_services(&report(&["a.com"], &[]), 1_000).unwrap();

        let mut erroring = report(&["a.com"], &[]);
        erroring.services[0].http_status = Some(530);
        store.record_services(&erroring, 2_000).unwrap();

        let events = store.service_events().unwrap();
        assert!(matches!(
            &events[0],
            ServiceEvent::Transition { status: ServiceStatus::Down, ts: 2_000, .. }
        ));
    }

    #[test]
    fn clearing_lets_a_still_down_service_log_its_outage_again() {
        let store = Store::open_in_memory().unwrap();
        store.record_services(&report(&["a.com"], &["b.com"]), 1_000).unwrap();
        store.clear_service_events().unwrap();
        assert!(store.service_events().unwrap().is_empty());

        // b.com is still down. Without clearing the baseline too, the diff would
        // read it as "already down" and the timeline would stay empty forever.
        store.record_services(&report(&["a.com"], &["b.com"]), 2_000).unwrap();
        let events = store.service_events().unwrap();
        assert!(events.iter().any(|e| matches!(
            e,
            ServiceEvent::Transition { host, status: ServiceStatus::Down, .. } if host == "b.com"
        )));
    }
}
