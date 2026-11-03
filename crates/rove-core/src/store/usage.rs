//! Daily data-usage buckets, keyed by local date.
use super::Store;
use rusqlite::{params, OptionalExtension};

impl Store {
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
            .query_row("SELECT rx_bytes, tx_bytes FROM usage_day WHERE date = ?1", [date], |row| {
                Ok((row.get::<_, i64>(0)? as u64, row.get::<_, i64>(1)? as u64))
            })
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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn usage_accumulates_and_prunes() {
        let store = Store::open_in_memory().unwrap();
        store.add_usage("2026-01-01", 10, 5).unwrap();
        store.add_usage("2026-01-01", 3, 2).unwrap();
        assert_eq!(store.usage_day("2026-01-01").unwrap(), (13, 7));
        assert_eq!(store.usage_day("2026-01-02").unwrap(), (0, 0));
        store.add_usage("2026-01-02", 1, 1).unwrap();
        store.prune_usage(1).unwrap();
        assert_eq!(store.usage_day("2026-01-01").unwrap(), (0, 0));
        assert_eq!(store.usage_day("2026-01-02").unwrap(), (1, 1));
    }
}
