//! The app's single durable store: one SQLite file in the app-data directory.
//!
//! Everything worth keeping across restarts lives here, one file per domain:
//! speed-test history (`speed`), daily data-usage buckets (`usage`), the
//! service list and its timeline (`services`), the roster of LAN devices we've
//! seen (`devices`) and the network-change feed (`events`). The
//! Rust side owns it (the samplers and scans that produce the data run here),
//! and the UI reaches it through thin Tauri commands. All methods lock an
//! internal `Mutex<Connection>`, so a shared `Arc<Store>` is safe to hand to
//! both command handlers and the background usage sampler.
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
/// 'lost'/'restored'; `count`/`total` are the running summary's tally and the
/// number of services it was drawn from. Each is null for the shapes that don't
/// use it — the row's `type` says which apply.
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
    /// Lock the connection, recovering the guard if a previous holder panicked
    /// rather than propagating the poison (which would wedge every subsequent
    /// query for the app's lifetime).
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
        // `total` arrived after the timeline shipped: a running summary used to
        // record only how many services were up, which left a partial baseline
        // ("5 up" while a 6th was down) indistinguishable from a full recovery,
        // and the UI read every summary as all-clear. Nullable, so existing rows
        // survive the add — the backfill below gives them a denominator.
        Self::ensure_column(&conn, "service_events", "total", "INTEGER")?;
        // Reconstruct that denominator for pre-`total` rows. A recovery summary
        // had everything up by construction, so its own count is already right;
        // a baseline may have been partial, and today's service list is the best
        // estimate left of what it was counting. MAX keeps the two consistent —
        // a list that has since shrunk must not read as "6 of 5 healthy". Gated
        // on IS NULL, so it can't rewrite a total a later probe recorded.
        conn.execute(
            "UPDATE service_events
                SET total = MAX(count, (SELECT COUNT(*) FROM services))
              WHERE type = 'running' AND total IS NULL",
            [],
        )?;
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
