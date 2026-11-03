//! The app's single durable store: one SQLite file in the app-data directory.
//!
//! Everything worth keeping across restarts lives here, one module per domain:
//! speed-test history (`speed`), daily data-usage buckets (`usage`), the service
//! list and its timeline (`services`), the LAN devices we've seen (`devices`)
//! and the network-change feed (`events`). The UI reaches it only through Tauri
//! commands. Every method locks an internal `Mutex<Connection>`, so one
//! `Arc<Store>` is shared by the command handlers and the background monitors.
mod devices;
mod events;
mod services;
mod speed;
mod usage;

pub use devices::{KnownDevice, OFFLINE_LIST_KEEP_MS};
pub use events::NetworkEvent;
pub use speed::{SpeedHistoryRecord, SPEED_HISTORY_LIMIT};

use crate::services::DEFAULT_SERVICES;
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use std::sync::Mutex;

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

/// v2: speed_history gains the link speed and Wi-Fi band at test time. Dropped
/// and recreated rather than altered: old rows never had these fields and speed
/// history is disposable.
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

/// v3: the network-change event feed. Append-only; rows come from diffing each
/// scan against `known_devices`, pruned by age and count.
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

/// v4: the user-editable service list. Seeded with the defaults exactly once
/// (in the `version < 4` block), so removing a default sticks: unlike the
/// idempotent table-creation guards, the seed never re-runs.
const SCHEMA_V4: &str = "
CREATE TABLE IF NOT EXISTS services (
    host     TEXT    PRIMARY KEY,
    name     TEXT    NOT NULL,
    position INTEGER NOT NULL
);
";

/// v5: the services outage timeline. It lives here, not in the UI, so the
/// always-on heartbeat records outages even with the window closed. Two tables:
/// the append-only log (pruned by age and count), and the per-host baseline each
/// probe is diffed against, so only crossings land in the log.
///
/// `status` holds a transition's 'up'/'down' or a connection event's
/// 'lost'/'restored'; `count`/`total` are a running summary's tally. Columns a
/// row's `type` doesn't use are null.
const SCHEMA_V5: &str = "
CREATE TABLE IF NOT EXISTS service_events (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    ts     INTEGER NOT NULL,
    type   TEXT    NOT NULL,
    host   TEXT,
    name   TEXT,
    status TEXT,
    count  INTEGER,
    total  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_service_events_ts ON service_events(ts DESC);
CREATE TABLE IF NOT EXISTS service_state (
    host   TEXT PRIMARY KEY,
    status TEXT NOT NULL
);
";

impl Store {
    /// Lock the connection, recovering from poison: one panicked holder must not
    /// wedge every later query for the app's lifetime.
    fn lock(&self) -> std::sync::MutexGuard<'_, Connection> {
        crate::util::net::lock(&self.conn)
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
            // INSERT OR IGNORE so a re-run (a colliding version number) can't
            // duplicate rows; the version gate keeps deleted defaults deleted.
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
        // A user_version stamped by a parallel branch can skip a block above
        // without its tables ever being created, and every insert and read then
        // fails with "no such table". The DDL is `IF NOT EXISTS` (and V4 never
        // re-seeds), so re-running it unconditionally is idempotent.
        conn.execute_batch(SCHEMA_V3)?;
        conn.execute_batch(SCHEMA_V4)?;
        conn.execute_batch(SCHEMA_V5)?;
        // Same trap for columns: a parallel branch also bumped the schema to v2
        // (adding its own `bufferbloat_ms`), so some installs reach version 2
        // without link_speed_mbps/frequency, and the `version < 2` gate skips
        // them. Add whatever is missing so history can't fail with "no such
        // column".
        Self::ensure_column(&conn, "speed_history", "link_speed_mbps", "REAL")?;
        Self::ensure_column(&conn, "speed_history", "frequency", "REAL")?;
        // `total` arrived after the timeline shipped. Without it a partial
        // baseline ("5 up" while a 6th was down) read the same as a full
        // recovery. Nullable, so existing rows survive; the backfill below gives
        // them a denominator.
        Self::ensure_column(&conn, "service_events", "total", "INTEGER")?;
        // A recovery had everything up, so its count is already right; for a
        // baseline, today's service list is the best estimate left. MAX keeps a
        // list that has since shrunk from reading "6 of 5 healthy". Gated on IS
        // NULL, so it never rewrites a recorded total.
        conn.execute(
            "UPDATE service_events
                SET total = MAX(count, (SELECT COUNT(*) FROM services))
              WHERE type = 'running' AND total IS NULL",
            [],
        )?;
        // Scrub reverse-DNS error text earlier builds stored as a hostname. macOS
        // `dig` prints diagnostics like ";; connection timed out; no servers could
        // be reached" to stdout, and the `COALESCE` upsert then pinned it forever.
        // A real hostname holds only `[A-Za-z0-9._-]`, so null anything else; it
        // re-resolves on the next scan. The table check covers a DB whose
        // collided version skipped creating it.
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
            // Added after known_devices shipped: the OS family and the
            // randomized-MAC flag, so a departure event labels a device the way
            // the live Devices view does instead of "Unknown". Nullable or
            // defaulted, so existing rows are untouched.
            Self::ensure_column(&conn, "known_devices", "os", "TEXT")?;
            Self::ensure_column(&conn, "known_devices", "randomized", "INTEGER NOT NULL DEFAULT 0")?;
        }
        Ok(())
    }

    /// Add `column` to `table` if it's missing. Names are fixed literals from the
    /// migration, never user input, so interpolating them is safe (and
    /// unavoidable: SQLite takes no bind parameters in DDL or PRAGMA).
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

    /// A small key/value table for one-off markers, such as when usage tracking
    /// began.
    pub fn get_meta_u64(&self, key: &str) -> rusqlite::Result<Option<u64>> {
        let value = Self::read_meta(&self.lock(), key)?;
        Ok(value.and_then(|s| s.parse().ok()))
    }

    pub fn set_meta_u64(&self, key: &str, value: u64) -> rusqlite::Result<()> {
        Self::write_meta(&self.lock(), key, &value.to_string())
    }

    /// The `meta` value under `key`, on a connection or transaction the caller
    /// already holds.
    pub(super) fn read_meta(conn: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
        conn.query_row("SELECT value FROM meta WHERE key = ?1", [key], |row| row.get(0))
            .optional()
    }

    /// Insert or overwrite the `meta` value under `key`.
    pub(super) fn write_meta(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
        conn.execute(
            "INSERT INTO meta (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn meta_round_trips() {
        let store = Store::open_in_memory().unwrap();
        assert_eq!(store.get_meta_u64("k").unwrap(), None);
        store.set_meta_u64("k", 42).unwrap();
        store.set_meta_u64("k", 43).unwrap();
        assert_eq!(store.get_meta_u64("k").unwrap(), Some(43));
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
