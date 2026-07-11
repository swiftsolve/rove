//! The app's single durable store: one SQLite file in the app-data directory.
//!
//! Everything worth keeping across restarts lives here — speed-test history,
//! daily data-usage buckets, and the roster of LAN devices we've seen. The
//! Rust side owns it (the samplers and scans that produce the data run here),
//! and the UI reaches it through thin Tauri commands. All methods lock an
//! internal `Mutex<Connection>`, so a shared `Arc<Store>` is safe to hand to
//! both command handlers and the background usage sampler.
use crate::types::LanDevice;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
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

/// A LAN device as remembered across scans, with first/last-seen timestamps.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnownDevice {
    pub mac: String,
    pub ip: Option<String>,
    pub hostname: Option<String>,
    pub vendor: Option<String>,
    pub kind: String,
    pub first_seen: i64,
    pub last_seen: i64,
}

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
    kind       TEXT    NOT NULL DEFAULT 'unknown',
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
    fn upsert_device(conn: &Connection, device: &LanDevice, now_ms: i64) -> rusqlite::Result<()> {
        conn.execute(
            "INSERT INTO known_devices
                (mac, ip, hostname, vendor, kind, first_seen, last_seen)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
             ON CONFLICT(mac) DO UPDATE SET
                ip        = excluded.ip,
                hostname  = COALESCE(excluded.hostname, known_devices.hostname),
                vendor    = COALESCE(excluded.vendor, known_devices.vendor),
                kind      = excluded.kind,
                last_seen = excluded.last_seen",
            params![device.mac, device.ip, device.hostname, device.vendor, device.kind, now_ms],
        )?;
        Ok(())
    }

    /// Upsert the devices from a scan.
    pub fn record_devices(&self, devices: &[LanDevice], now_ms: i64) -> rusqlite::Result<()> {
        let mut conn = self.lock();
        let tx = conn.transaction()?;
        for device in devices.iter().filter(|d| !d.mac.is_empty()) {
            Self::upsert_device(&tx, device, now_ms)?;
        }
        tx.commit()?;
        Ok(())
    }

    /// Every device we've ever recorded, most-recently-seen first.
    pub fn known_devices(&self) -> rusqlite::Result<Vec<KnownDevice>> {
        let conn = self.lock();
        let mut stmt = conn.prepare(
            "SELECT mac, ip, hostname, vendor, kind, first_seen, last_seen
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
            })
        })?;
        rows.collect()
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
}
