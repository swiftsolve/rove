//! The user's service list and its outage timeline: only crossings are logged,
//! diffed against a per-host baseline.
use super::Store;
use crate::diagnostics::InternetStatus;
use crate::services::{
    ConnectionChange, ServiceDef, ServiceEvent, ServiceReachability, ServiceStatus, ServicesReport,
};
use rusqlite::{params, Connection};

/// `meta` key for whether the services timeline sits inside a recorded
/// connection drop ("lost"/"restored"). Separate from `META_INTERNET_STATUS` in
/// `events.rs`, which `record_internet` diffs against: sharing one key would let
/// whichever recorder ran first swallow the crossing before the other saw it.
const META_SERVICE_CONNECTION: &str = "service_connection_status";

/// Longer than the network feed's 7 days: "when was Netflix last down" is worth
/// a month, and the log only grows on a crossing, so a month is still tiny.
const SERVICE_EVENT_RETENTION_MS: i64 = 30 * 24 * 60 * 60 * 1000;

/// Hard cap, so a flapping service can't grow the table without bound inside
/// the retention window.
const SERVICE_EVENT_LIMIT: i64 = 500;

impl Store {
    /// Fold one probe batch into the services timeline, recording only what
    /// changed: a service crossing up or down, a `Running` baseline the first
    /// time the services are seen, a `Running` summary when the last outage
    /// clears, and one connection drop or return when *this machine* is
    /// offline. Unchanged probes write nothing, so the heartbeat calls it every
    /// tick.
    ///
    /// While this machine has no internet, per-service diffing freezes: every
    /// probe fails because of *our* outage, so logging them would be a wall of
    /// false downs. The recovery then diffs against the real pre-outage state.
    pub fn record_services(
        &self,
        report: &ServicesReport,
        now_ms: i64,
    ) -> rusqlite::Result<()> {

        if report.services.is_empty() {
            return Ok(());
        }
        let offline = !matches!(report.internet, InternetStatus::Online);

        let mut conn = self.lock();
        let was_offline =
            Self::read_meta(&conn, META_SERVICE_CONNECTION)?.as_deref() == Some("lost");

        let tx = conn.transaction()?;

        // Record the drop once on the way in, then stop: the per-service state
        // stays frozen at its pre-outage values.
        if offline {
            if !was_offline {
                Self::insert_service_event(
                    &tx,
                    &ServiceEvent::Connection { status: ConnectionChange::Lost, ts: now_ms },
                )?;
                Self::write_meta(&tx, META_SERVICE_CONNECTION, "lost")?;
                Self::prune_service_events(&tx, now_ms)?;
                tx.commit()?;
            }
            return Ok(());
        }

        let mut events: Vec<ServiceEvent> = Vec::new();

        // Close a recorded drop before resuming per-service diffing, so the
        // timeline reads as one outage rather than a gap.
        if was_offline {
            events.push(ServiceEvent::Connection { status: ConnectionChange::Restored, ts: now_ms });
            Self::write_meta(&tx, META_SERVICE_CONNECTION, "restored")?;
        }

        let previous = Self::service_state(&tx)?;
        let up_count = report
            .services
            .iter()
            .filter(|svc| Self::reachability_status(svc) == ServiceStatus::Up)
            .count() as i64;
        let total_count = report.services.len() as i64;

        // Anchor a brand-new timeline with a summary instead of leaving it blank
        // until something breaks. It can be partial: a service already down is
        // counted out here and gets its own "went down" row below.
        if Self::service_events_is_empty(&tx)? && up_count > 0 {
            events.push(ServiceEvent::Running { count: up_count, total: total_count, ts: now_ms });
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

        // Full recovery, so this summary is always `up_count == total_count`.
        if recovered && previously_any_down && !now_any_down {
            events.push(ServiceEvent::Running { count: up_count, total: total_count, ts: now_ms });
        }

        if events.is_empty() {
            // Still commit: the state rows above may have seeded new hosts, and
            // dropping them would re-seed forever.
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

    /// Down when the path failed (no latency) or the host answered with a 5xx.
    /// Matches the Services view's verdict, so the timeline never disagrees with
    /// the live list.
    fn reachability_status(svc: &ServiceReachability) -> ServiceStatus {
        match (svc.latency_ms, svc.http_status) {
            (None, _) => ServiceStatus::Down,
            (_, Some(status)) if status >= 500 => ServiceStatus::Down,
            _ => ServiceStatus::Up,
        }
    }

    fn set_service_state(
        conn: &Connection,
        host: &str,
        status: ServiceStatus,
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
    ) -> rusqlite::Result<std::collections::HashMap<String, ServiceStatus>> {
        let mut stmt = conn.prepare("SELECT host, status FROM service_state")?;
        let rows = stmt.query_map([], |row| {
            let host: String = row.get(0)?;
            let status: String = row.get(1)?;
            Ok((host, Self::parse_status(Some(&status))))
        })?;
        rows.collect()
    }

    fn status_str(status: ServiceStatus) -> &'static str {
        match status {
            ServiceStatus::Up => "up",
            ServiceStatus::Down => "down",
        }
    }

    /// The inverse of `status_str`. Anything but "down" reads as up, so a
    /// missing or unexpected value never invents an outage.
    fn parse_status(stored: Option<&str>) -> ServiceStatus {
        if stored == Some("down") {
            ServiceStatus::Down
        } else {
            ServiceStatus::Up
        }
    }

    fn service_events_is_empty(conn: &Connection) -> rusqlite::Result<bool> {
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM service_events", [], |row| row.get(0))?;
        Ok(count == 0)
    }

    fn insert_service_event(
        conn: &Connection,
        event: &ServiceEvent,
    ) -> rusqlite::Result<()> {
        match event {
            ServiceEvent::Transition { host, name, status, ts } => conn.execute(
                "INSERT INTO service_events (ts, type, host, name, status)
                 VALUES (?1, 'transition', ?2, ?3, ?4)",
                params![ts, host, name, Self::status_str(*status)],
            )?,
            ServiceEvent::Running { count, total, ts } => conn.execute(
                "INSERT INTO service_events (ts, type, count, total)
                 VALUES (?1, 'running', ?2, ?3)",
                params![ts, count, total],
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
    pub fn service_events(&self) -> rusqlite::Result<Vec<ServiceEvent>> {
        let conn = self.lock();
        let mut stmt = conn.prepare(
            "SELECT ts, type, host, name, status, count, total FROM service_events
             ORDER BY ts DESC, id DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            let ts: i64 = row.get(0)?;
            let kind: String = row.get(1)?;
            let host: Option<String> = row.get(2)?;
            let name: Option<String> = row.get(3)?;
            let status: Option<String> = row.get(4)?;
            let count: Option<i64> = row.get(5)?;
            let total: Option<i64> = row.get(6)?;
            Ok(match kind.as_str() {
                "running" => {
                    let count = count.unwrap_or(0);
                    // A pre-`total` row the backfill left null reads as
                    // all-clear, which is what every summary claimed back then.
                    Some(ServiceEvent::Running { count, total: total.unwrap_or(count), ts })
                }
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
                        status: Self::parse_status(status.as_deref()),
                        ts,
                    }),
                    _ => None,
                },
                _ => None,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?.into_iter().flatten().collect())
    }

    /// Drop the timeline and the baseline it diffs against. Without clearing the
    /// baseline, a service that's down now would never log its `down` again.
    pub fn clear_service_events(&self) -> rusqlite::Result<()> {
        let mut conn = self.lock();
        let tx = conn.transaction()?;
        tx.execute("DELETE FROM service_events", [])?;
        tx.execute("DELETE FROM service_state", [])?;
        tx.execute("DELETE FROM meta WHERE key = ?1", [META_SERVICE_CONNECTION])?;
        tx.commit()?;
        Ok(())
    }

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

    /// Edit the service listed under `old_host`, keeping its place in the list.
    /// If the new `host` is already listed elsewhere, the edit folds into that
    /// row (as re-adding it would); if `old_host` isn't listed, the service is
    /// appended. Returns the updated list.
    pub fn update_service(
        &self,
        old_host: &str,
        name: &str,
        host: &str,
    ) -> rusqlite::Result<Vec<ServiceDef>> {
        let updated = {
            let conn = self.lock();
            // OR IGNORE: a new host that's already listed skips the row rather
            // than failing on the primary key, and falls through to the merge.
            conn.execute(
                "UPDATE OR IGNORE services SET host = ?2, name = ?3 WHERE host = ?1",
                params![old_host, host, name],
            )?
        };
        if updated > 0 {
            return self.services();
        }
        self.delete_service(old_host)?;
        self.add_service(name, host)
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
    use crate::services::DEFAULT_SERVICES;

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

        // Editing a service's host keeps its place in the list.
        let before = store.services().unwrap();
        let edited = store.update_service(&before[1].host, "Moved", "moved.example").unwrap();
        assert_eq!(edited.len(), before.len());
        assert_eq!(edited[1].host, "moved.example");
        assert_eq!(edited[1].name, "Moved");

        // Editing onto a host that's already listed folds into that row.
        let merged = store.update_service("moved.example", "Ex again", "example.com").unwrap();
        assert_eq!(merged.len(), before.len() - 1);
        assert!(merged.iter().all(|s| s.host != "moved.example"));
        assert_eq!(merged.last().unwrap().name, "Ex again");

        // Editing a host that's no longer listed appends it.
        let appended = store.update_service("gone.example", "Back", "back.example").unwrap();
        assert_eq!(appended.last().unwrap().host, "back.example");

        // Deleting a built-in default sticks (and isn't re-seeded on re-migrate).
        store.delete_service("google.com").unwrap();
        store.migrate().unwrap();
        assert!(store.services().unwrap().iter().all(|s| s.host != "google.com"));
    }

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
        assert_eq!(events, vec![ServiceEvent::Running { count: 2, total: 2, ts: 1_000 }]);
    }

    /// The UI reads `count`/`total` verbatim to tell "all healthy" from "5 of 6
    /// healthy". A rename would leave it comparing against `undefined`, so pin
    /// the wire shape.
    #[test]
    fn running_event_serializes_with_the_field_names_the_ui_reads() {
        let json = serde_json::to_value(ServiceEvent::Running {
            count: 5,
            total: 6,
            ts: 1_000,
        })
        .unwrap();

        assert_eq!(
            json,
            serde_json::json!({ "type": "running", "count": 5, "total": 6, "ts": 1_000 })
        );
    }

    /// A service already down the first time we look makes the baseline partial.
    /// It must carry the full total rather than passing 2-of-3 off as all-clear.
    #[test]
    fn services_first_sight_baseline_is_partial_when_one_is_already_down() {
        let store = Store::open_in_memory().unwrap();
        store
            .record_services(&report(&["a.com", "b.com"], &["c.com"]), 1_000)
            .unwrap();

        let events = store.service_events().unwrap();
        let baseline = events
            .iter()
            .find(|e| matches!(e, ServiceEvent::Running { .. }))
            .expect("a baseline summary");
        assert_eq!(*baseline, ServiceEvent::Running { count: 2, total: 3, ts: 1_000 });
    }

    #[test]
    fn services_records_only_crossings_not_every_probe() {
        let store = Store::open_in_memory().unwrap();
        store.record_services(&report(&["a.com"], &[]), 1_000).unwrap();
        // Same verdict three more times: the log must not grow.
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
        assert_eq!(events[0], ServiceEvent::Running { count: 2, total: 2, ts: 3_000 });
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
        // Only the drop and the original baseline: no per-service downs, and the
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
