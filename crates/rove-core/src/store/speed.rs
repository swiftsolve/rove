//! Speed-test history: the newest results, capped.
use super::Store;
use rusqlite::params;
use serde::{Deserialize, Serialize};

/// How many speed-test results are kept, newest first.
pub const SPEED_HISTORY_LIMIT: i64 = 50;

/// One recorded speed test. Mirrors `SpeedHistoryEntry` in
/// `src/types/history.ts`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedHistoryRecord {
    /// Epoch ms.
    pub timestamp: i64,
    pub download_mbps: f64,
    pub upload_mbps: f64,
    pub latency_ms: f64,
    pub jitter_ms: f64,
    pub packet_loss: f64,
    pub connection_type: String,
    pub network_name: Option<String>,
    pub link_speed_mbps: Option<f64>,
    /// Wi-Fi centre frequency in MHz, for the band label.
    pub frequency: Option<f64>,
}

impl Store {
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

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
        assert_eq!(i64::try_from(rows.len()).unwrap(), SPEED_HISTORY_LIMIT);
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
}
