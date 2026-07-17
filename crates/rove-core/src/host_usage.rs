//! Per-app *remote host* attribution — "which hosts is each app talking to, and
//! how much". Where [`crate::app_usage`] answers "how many bytes has this app
//! moved" (a per-process total), this module keeps the traffic broken down by
//! the remote peer on the other end of each TCP connection, so the Hosts view
//! can show, under each app, the hosts it reached with a hostname, country flag,
//! and byte split.
//!
//! It reuses the same peer-address sources the OS already exposes — no packet
//! capture, no elevated privileges:
//!
//!   * **Linux** — `ss -tinHp` lists each TCP socket with its `LOCAL`/`PEER`
//!     address pair and the owning process, plus `bytes_sent`/`bytes_received`.
//!   * **macOS** — `nettop` *without* `-P` prints one row per process followed
//!     by a row per connection (`tcp4 local<->peer …`) carrying that
//!     connection's cumulative byte counts. (The Apps view keeps its own `-P`
//!     process-total sampler; this is a separate, peer-aware pass.)
//!   * **Windows / other** — the Kernel-Network ETW events carry a PID and a
//!     size but no peer address, so per-host attribution isn't available.
//!
//! Both supported sources report *cumulative* counters per socket, so — exactly
//! like the interface and per-app trackers — [`HostUsageTracker`] banks the
//! delta per socket into a running per-`(app, peer-ip)` total.
//!
//! Hostnames (reverse DNS) and countries ([`crate::geoip`], a bundled table —
//! no per-peer network call) are resolved *outside* the tracker and fed back in:
//! [`HostUsageTracker`] exposes the peer IPs still awaiting each lookup
//! ([`pending_hostnames`], [`pending_countries`]) and accepts the answers
//! ([`record_hostnames`], [`record_countries`]), caching them (including misses)
//! so a peer is resolved at most once.

use crate::types::{AppHosts, HostConn, HostUsageSummary};
use std::collections::{HashMap, HashSet};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

/// `"supported"` on platforms whose per-socket source carries a peer address
/// (Linux, macOS); `"unsupported"` elsewhere. Unlike [`crate::app_usage`]'s
/// per-process totals, Windows ETW can't back this at all (no peer in the
/// events), so it's a compile-time constant rather than a runtime check.
pub fn platform_support() -> &'static str {
    if cfg!(any(target_os = "linux", target_os = "macos")) {
        "supported"
    } else {
        "unsupported"
    }
}

/// One cumulative reading for a single connection (socket). `conn_key` is a
/// stable identity for that socket across samples (its local/peer address pair),
/// so the tracker can diff it tick to tick; `app` is the owning process name,
/// `ip` the remote peer with the port stripped (the host grouping key).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PeerReading {
    pub conn_key: String,
    pub app: String,
    pub ip: String,
    pub rx: u64,
    pub tx: u64,
    /// Owning process id when the source reports one (macOS), used to resolve
    /// the app icon; `None` on Linux (keyed by socket, no icon lookup).
    pub pid: Option<u32>,
}

/// Take one snapshot of per-connection cumulative byte counters, tagged with the
/// remote peer. Empty on an unsupported platform or when the source tool returns
/// nothing (no open TCP sockets).
pub async fn sample() -> Vec<PeerReading> {
    #[cfg(target_os = "linux")]
    {
        return match crate::shell::try_run("ss -tinHp").await {
            Some(out) => parse_ss_peers(&out),
            None => Vec::new(),
        };
    }
    // No -P: nettop then prints per-connection sub-rows (with peer + per-conn
    // bytes) under each process row. -m tcp limits to TCP (the only mode with a
    // meaningful peer), -x raw bytes, -n no DNS (we do our own reverse lookup).
    #[cfg(target_os = "macos")]
    {
        return match crate::shell::try_run("nettop -L 1 -x -n -m tcp").await {
            Some(out) => parse_nettop_peers(&out),
            None => Vec::new(),
        };
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        Vec::new()
    }
}

/// Reuses [`crate::app_usage`]'s field/proc-name readers so the two `ss` parsers
/// stay consistent.
#[cfg(any(target_os = "linux", test))]
use crate::app_usage::{field_u64, ss_proc_name};

/// Parse `ss -tinHp` into per-socket peer readings. Each socket is a header line
/// (`STATE recvq sendq LOCAL PEER users:((...))`) followed by an indented info
/// line carrying the byte counters. Sockets without a process, without a byte
/// line, or without a routable peer (listeners, loopback) are dropped.
#[cfg(any(target_os = "linux", test))]
fn parse_ss_peers(output: &str) -> Vec<PeerReading> {
    let mut readings = Vec::new();
    // (app, conn_key, peer_ip) awaiting its following info line.
    let mut pending: Option<(String, String, String)> = None;

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        if trimmed.contains("bytes_sent:") || trimmed.contains("bytes_received:") {
            if let Some((app, conn_key, ip)) = pending.take() {
                let tx = field_u64(trimmed, "bytes_sent:").unwrap_or(0);
                let rx = field_u64(trimmed, "bytes_received:").unwrap_or(0);
                readings.push(PeerReading { conn_key, app, ip, rx, tx, pid: None });
            }
            continue;
        }

        pending = match ss_proc_name(trimmed) {
            Some(app) => {
                let mut cols = trimmed.split_whitespace();
                let local = cols.nth(3);
                let peer = cols.next();
                match (local, peer, peer.and_then(peer_ip)) {
                    (Some(local), Some(peer), Some(ip)) => {
                        Some((app, format!("{local}|{peer}"), ip))
                    }
                    // A socket with no routable peer (listener/loopback) resets
                    // the pairing so its info line isn't misattributed.
                    _ => None,
                }
            }
            None => None,
        };
    }
    readings
}

/// Parse `nettop -L 1 -x -n -m tcp` (no `-P`). Output alternates a process row
/// (`name.pid,,,bytes_in,bytes_out,…`) with the connection rows beneath it
/// (`tcp4 local<->peer,iface,state,bytes_in,bytes_out,…`). The process row sets
/// the owning app for the connection rows that follow, until the next process
/// row. Connections without a routable peer (listeners, `*`, loopback) are
/// skipped.
#[cfg(any(target_os = "macos", test))]
fn parse_nettop_peers(output: &str) -> Vec<PeerReading> {
    let mut readings = Vec::new();
    // The app + pid whose connection rows we're currently reading.
    let mut current: Option<(String, Option<u32>)> = None;

    for line in output.lines() {
        // Keep empty trailing fields so byte columns stay at fixed indices.
        let fields: Vec<&str> = line.split(',').collect();
        let Some(&label) = fields.get(1) else { continue };
        let label = label.trim();
        if label.is_empty() {
            continue;
        }

        // A connection row: "tcpN local<->peer". Attribute it to the current
        // process; pull its per-connection byte columns.
        if let Some((_, peer)) = label.split_once("<->") {
            let Some((app, pid)) = &current else { continue };
            let Some(ip) = peer_ip(peer.trim()) else { continue };
            let rx = fields.get(4).and_then(|f| f.trim().parse::<u64>().ok());
            let tx = fields.get(5).and_then(|f| f.trim().parse::<u64>().ok());
            let (Some(rx), Some(tx)) = (rx, tx) else { continue };
            readings.push(PeerReading {
                conn_key: label.to_string(),
                app: app.clone(),
                ip,
                rx,
                tx,
                pid: *pid,
            });
            continue;
        }

        // Otherwise a process row: "name.pid". Set the context for the rows
        // beneath it. Anything without a numeric pid suffix (the header) is
        // ignored and leaves the previous context untouched only if we clear it.
        if let Some((name, pid)) = label.rsplit_once('.') {
            if !name.is_empty() && !pid.is_empty() && pid.bytes().all(|b| b.is_ascii_digit()) {
                current = Some((name.to_string(), pid.parse::<u32>().ok()));
                continue;
            }
        }
        // Unrecognised leading field (e.g. the header row): drop the context so
        // stray following rows aren't misattributed.
        current = None;
    }
    readings
}

/// Extract the bare IP from a `host:port` / `[v6]:port` / `v6.port` peer token,
/// returning `None` for a listener wildcard or a non-routable (loopback /
/// unspecified) address — those aren't hosts worth showing.
fn peer_ip(addr: &str) -> Option<String> {
    let a = addr.trim();
    if a.is_empty() || a.starts_with('*') {
        return None;
    }
    let ip = strip_port(a)?;
    match ip.parse::<IpAddr>() {
        Ok(parsed) if is_shown(parsed) => Some(ip),
        _ => None,
    }
}

/// Strip the port from a peer token across the formats the two sources emit:
/// `1.2.3.4:443` (both), `[2606::1]:443` (ss IPv6), `2606::1.443` (nettop IPv6).
fn strip_port(addr: &str) -> Option<String> {
    // ss IPv6 bracket form: [addr]:port
    if let Some(rest) = addr.strip_prefix('[') {
        return rest.split(']').next().map(str::to_string).filter(|s| !s.is_empty());
    }
    if addr.matches(':').count() >= 2 {
        // IPv6. nettop tacks the port on with a dot after the address; strip a
        // trailing ".<digits>" only when it sits past the last colon.
        if let (Some(dot), Some(colon)) = (addr.rfind('.'), addr.rfind(':')) {
            if colon < dot && addr[dot + 1..].bytes().all(|b| b.is_ascii_digit()) {
                return Some(addr[..dot].to_string());
            }
        }
        return Some(addr.to_string());
    }
    // IPv4 (or a bare host): trim a trailing :port.
    match addr.rsplit_once(':') {
        Some((ip, port)) if !port.is_empty() && port.bytes().all(|b| b.is_ascii_digit()) => {
            Some(ip.to_string())
        }
        _ => Some(addr.to_string()),
    }
}

/// Whether a peer is worth listing at all: exclude loopback and unspecified
/// (same-machine / no address). Private/LAN peers *are* shown (a local service
/// is a legitimate host), just without a country flag — see [`ip_is_public`].
fn is_shown(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => !v4.is_loopback() && !v4.is_unspecified() && !v4.is_broadcast(),
        IpAddr::V6(v6) => !v6.is_loopback() && !v6.is_unspecified(),
    }
}

/// Whether a peer IP is a public, geolocatable address — false for private,
/// carrier-NAT, link-local, and reserved ranges, which have no meaningful
/// country and so are never sent to the geolocation service.
fn ip_is_public(ip: &str) -> bool {
    match ip.parse::<IpAddr>() {
        Ok(IpAddr::V4(v4)) => v4_is_public(v4),
        Ok(IpAddr::V6(v6)) => v6_is_public(v6),
        Err(_) => false,
    }
}

fn v4_is_public(v4: Ipv4Addr) -> bool {
    let [a, b, ..] = v4.octets();
    // 100.64.0.0/10 — carrier-grade NAT (not covered by `is_private`).
    let is_cgnat = a == 100 && (64..=127).contains(&b);
    !(v4.is_private()
        || v4.is_loopback()
        || v4.is_link_local()
        || v4.is_broadcast()
        || v4.is_documentation()
        || v4.is_unspecified()
        || is_cgnat)
}

fn v6_is_public(v6: Ipv6Addr) -> bool {
    let first = v6.segments()[0];
    let is_link_local = (first & 0xffc0) == 0xfe80; // fe80::/10
    let is_unique_local = (first & 0xfe00) == 0xfc00; // fc00::/7
    !(v6.is_loopback() || v6.is_unspecified() || is_link_local || is_unique_local)
}

#[derive(Default, Clone, Copy)]
struct ByteCounts {
    rx: u64,
    tx: u64,
}

/// Turns per-connection cumulative counters into per-`(app, peer-ip)` running
/// totals, and holds the resolved hostname/country per peer IP. `last` holds the
/// previous reading per socket (to diff); `totals` banks bytes per app then per
/// peer. Hostname/country caches are populated asynchronously from outside and
/// joined in at [`summary`] time.
#[derive(Default)]
pub struct HostUsageTracker {
    last: HashMap<String, ByteCounts>,
    totals: HashMap<String, HashMap<String, ByteCounts>>,
    since: Option<u64>,
    /// Resolved app icon per app name (`None` cached too — see [`app_usage`]).
    icons: HashMap<String, Option<String>>,
    /// Reverse-DNS hostname per peer IP. Presence marks "already attempted";
    /// `None` is a cached miss (no PTR) so we don't re-resolve every tick.
    hostnames: HashMap<String, Option<String>>,
    /// Country code per peer IP. Presence marks "already resolved"; a private
    /// address is seeded `None` at ingest so it's never sent to the lookup.
    countries: HashMap<String, Option<String>>,
}

impl HostUsageTracker {
    pub fn new() -> Self {
        Self::default()
    }

    /// Fold one snapshot into the running totals. Mirrors
    /// [`crate::app_usage::AppUsageTracker::ingest`]'s delta accounting: credit
    /// each socket's growth since its last reading (a fresh or counter-reset
    /// socket contributes its full reading), and forget sockets that vanished.
    pub fn ingest(&mut self, readings: Vec<PeerReading>) {
        if self.since.is_none() {
            self.since = Some(crate::net_util::now_ms());
        }

        let mut seen = HashSet::with_capacity(readings.len());
        for reading in readings {
            let prev = self.last.get(&reading.conn_key).copied();
            let delta = |now: u64, was: Option<u64>| match was {
                Some(p) if now >= p => now - p,
                _ => now,
            };
            let drx = delta(reading.rx, prev.map(|p| p.rx));
            let dtx = delta(reading.tx, prev.map(|p| p.tx));

            self.last.insert(reading.conn_key.clone(), ByteCounts { rx: reading.rx, tx: reading.tx });
            seen.insert(reading.conn_key);

            // Resolve the app icon once per name (skipped under cfg(test) so the
            // accounting tests don't shell into AppKit).
            if !self.icons.contains_key(&reading.app) {
                #[cfg(not(test))]
                let icon = crate::platform::app_icon::app_icon_data_uri(&reading.app, reading.pid);
                #[cfg(test)]
                let icon: Option<String> = None;
                self.icons.insert(reading.app.clone(), icon);
            }

            // A private/reserved peer has no country: seed the cache with a miss
            // now so it's never offered for geolocation. The table would answer
            // "no record" for most of these anyway, but not all — CGNAT and other
            // shared ranges can carry a record, and reporting a country for the
            // carrier's block would be a fiction about the peer.
            if !ip_is_public(&reading.ip) {
                self.countries.entry(reading.ip.clone()).or_insert(None);
            }

            let by_ip = self.totals.entry(reading.app).or_default();
            let entry = by_ip.entry(reading.ip).or_default();
            entry.rx = entry.rx.saturating_add(drx);
            entry.tx = entry.tx.saturating_add(dtx);
        }
        self.last.retain(|key, _| seen.contains(key));
    }

    /// Peer IPs seen but not yet reverse-resolved, so the caller can batch a
    /// reverse-DNS lookup and feed the answers back via [`record_hostnames`].
    pub fn pending_hostnames(&self) -> Vec<String> {
        self.known_ips().filter(|ip| !self.hostnames.contains_key(*ip)).cloned().collect()
    }

    /// Public peer IPs seen but not yet geolocated, for the caller to resolve
    /// via [`crate::geoip`] and feed back through [`record_countries`].
    /// Private/reserved addresses are pre-seeded at ingest and never appear here.
    pub fn pending_countries(&self) -> Vec<String> {
        self.known_ips().filter(|ip| !self.countries.contains_key(*ip)).cloned().collect()
    }

    fn known_ips(&self) -> impl Iterator<Item = &String> {
        self.totals.values().flat_map(HashMap::keys)
    }

    /// Record reverse-DNS results (IP → hostname, `None` for no PTR). Cached
    /// including misses so each IP is resolved at most once.
    pub fn record_hostnames(&mut self, resolved: HashMap<String, Option<String>>) {
        self.hostnames.extend(resolved);
    }

    /// Record geolocation results (IP → ISO-2 country code, `None` for an
    /// address the table has no country for). Cached including misses: the
    /// lookup is a local table read, so a miss is a stable answer about the
    /// address rather than a failure that might succeed on a retry.
    pub fn record_countries(&mut self, resolved: HashMap<String, Option<String>>) {
        self.countries.extend(resolved);
    }

    /// Per-app remote-host breakdown, busiest app (and busiest host within each)
    /// first, dropping hosts and apps that have moved nothing.
    pub fn summary(&self) -> HostUsageSummary {
        let mut apps: Vec<AppHosts> = self
            .totals
            .iter()
            .filter_map(|(name, by_ip)| {
                let mut hosts: Vec<HostConn> = by_ip
                    .iter()
                    .filter(|(_, b)| b.rx > 0 || b.tx > 0)
                    .map(|(ip, b)| HostConn {
                        ip: ip.clone(),
                        host: self.hostnames.get(ip).cloned().flatten(),
                        country_code: self.countries.get(ip).cloned().flatten(),
                        rx_bytes: b.rx,
                        tx_bytes: b.tx,
                    })
                    .collect();
                if hosts.is_empty() {
                    return None;
                }
                hosts.sort_by(|a, b| {
                    (b.rx_bytes + b.tx_bytes)
                        .cmp(&(a.rx_bytes + a.tx_bytes))
                        .then_with(|| a.ip.cmp(&b.ip))
                });
                let rx_bytes = hosts.iter().map(|h| h.rx_bytes).sum();
                let tx_bytes = hosts.iter().map(|h| h.tx_bytes).sum();
                Some(AppHosts {
                    name: name.clone(),
                    icon: self.icons.get(name).cloned().flatten(),
                    rx_bytes,
                    tx_bytes,
                    hosts,
                })
            })
            .collect();
        apps.sort_by(|a, b| {
            (b.rx_bytes + b.tx_bytes)
                .cmp(&(a.rx_bytes + a.tx_bytes))
                .then_with(|| a.name.cmp(&b.name))
        });

        HostUsageSummary { apps, support: platform_support(), tracking_since: self.since }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ss_peer_rows() {
        let out = "\
ESTAB 0 0 192.168.1.42:52134 140.82.113.25:443 users:((\"firefox\",pid=1234,fd=90))
\t cubic wscale:8,7 bytes_sent:5231 bytes_acked:5231 bytes_received:18422 segs_out:20
ESTAB 0 0 192.168.1.42:40122 [2606:4700::6810:85e5]:443 users:((\"spotify\",pid=567,fd=44))
\t cubic bytes_sent:1200 bytes_received:900 segs_out:8
LISTEN 0 128 127.0.0.1:5432 0.0.0.0:* users:((\"postgres\",pid=99,fd=7))
\t cubic bytes_sent:0 bytes_received:0";
        let r = parse_ss_peers(out);
        assert_eq!(r.len(), 2);
        assert_eq!(r[0].app, "firefox");
        assert_eq!(r[0].ip, "140.82.113.25");
        assert_eq!(r[0].rx, 18422);
        assert_eq!(r[0].tx, 5231);
        // IPv6 peer in ss bracket form, port stripped.
        assert_eq!(r[1].app, "spotify");
        assert_eq!(r[1].ip, "2606:4700::6810:85e5");
    }

    #[test]
    fn parses_nettop_connection_rows() {
        // Header, then two processes each with a connection row, plus a
        // loopback and a listener row that must be dropped.
        let out = "\
time,,interface,state,bytes_in,bytes_out,rx_dupe
16:17:52.9,apsd.375,,,6461,53268,0
16:17:52.8,tcp4 192.168.2.16:62740<->17.57.147.7:5223,en0,Established,6461,53268,0
16:17:52.9,OneDrive.1604,,,14564,3563,174
16:17:52.8,tcp4 192.168.2.16:63209<->4.145.79.81:443,en0,Established,14564,3563,174
16:17:52.8,tcp4 127.0.0.1:50216<->127.0.0.1:35765,lo0,Established,999,999,0
16:17:52.8,tcp6 ::1.8021<->*.*,lo0,Listen,,,";
        let r = parse_nettop_peers(out);
        assert_eq!(r.len(), 2);
        assert_eq!(r[0].app, "apsd");
        assert_eq!(r[0].ip, "17.57.147.7");
        assert_eq!(r[0].rx, 6461);
        assert_eq!(r[0].tx, 53268);
        assert_eq!(r[0].pid, Some(375));
        assert_eq!(r[1].app, "OneDrive");
        assert_eq!(r[1].ip, "4.145.79.81");
    }

    #[test]
    fn nettop_ipv6_peer_port_stripped() {
        let out = "\
time,,interface,state,bytes_in,bytes_out
16:00:00.0,Safari.900,,,10,20
16:00:00.0,tcp6 2606:4700::1.55123<->2606:4700::1111.443,en0,Established,10,20";
        let r = parse_nettop_peers(out);
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].ip, "2606:4700::1111");
    }

    #[test]
    fn accumulates_per_app_per_host_deltas() {
        let mut t = HostUsageTracker::new();
        t.ingest(vec![
            PeerReading { conn_key: "s1".into(), app: "firefox".into(), ip: "1.1.1.1".into(), rx: 100, tx: 40, pid: None },
            PeerReading { conn_key: "s2".into(), app: "firefox".into(), ip: "1.1.1.1".into(), rx: 50, tx: 10, pid: None },
        ]);
        // s1 grows (credit delta), s2 unchanged, plus a new host for firefox.
        t.ingest(vec![
            PeerReading { conn_key: "s1".into(), app: "firefox".into(), ip: "1.1.1.1".into(), rx: 250, tx: 90, pid: None },
            PeerReading { conn_key: "s2".into(), app: "firefox".into(), ip: "1.1.1.1".into(), rx: 50, tx: 10, pid: None },
            PeerReading { conn_key: "s3".into(), app: "firefox".into(), ip: "8.8.8.8".into(), rx: 500, tx: 0, pid: None },
        ]);
        let s = t.summary();
        assert_eq!(s.apps.len(), 1);
        let firefox = &s.apps[0];
        // Busiest host (8.8.8.8, 500) first; 1.1.1.1 sums both sockets.
        assert_eq!(firefox.hosts[0].ip, "8.8.8.8");
        assert_eq!(firefox.hosts[1].ip, "1.1.1.1");
        assert_eq!(firefox.hosts[1].rx_bytes, 250 + 50);
        assert_eq!(firefox.hosts[1].tx_bytes, 90 + 10);
        assert_eq!(firefox.rx_bytes, 500 + 300);
    }

    #[test]
    fn resolves_countries_end_to_end_through_the_bundled_table() {
        // The sequence `spawn_host_usage_sampler` runs each tick, minus tokio:
        // ingest → pending_countries → geoip → record_countries → summary. The
        // per-piece tests above stub the country in, so this is what would catch
        // the two halves being wired together wrong.
        let mut t = HostUsageTracker::new();
        t.ingest(vec![
            PeerReading { conn_key: "a".into(), app: "firefox".into(), ip: "8.8.8.8".into(), rx: 10, tx: 0, pid: None },
            PeerReading { conn_key: "b".into(), app: "firefox".into(), ip: "192.168.1.5".into(), rx: 5, tx: 0, pid: None },
        ]);

        let resolved: HashMap<String, Option<String>> = t
            .pending_countries()
            .into_iter()
            .map(|ip| {
                let code = crate::geoip::country_code(&ip);
                (ip, code)
            })
            .collect();
        t.record_countries(resolved);

        let hosts = &t.summary().apps[0].hosts;
        let public = hosts.iter().find(|h| h.ip == "8.8.8.8").expect("public peer in summary");
        let private = hosts.iter().find(|h| h.ip == "192.168.1.5").expect("private peer in summary");
        assert_eq!(public.country_code.as_deref(), Some("US"));
        // The LAN peer is still a listed host — it just has no flag.
        assert_eq!(private.country_code, None);

        // One pass clears the whole backlog: nothing is left waiting, which is
        // what dropping the old per-tick lookup budget bought.
        assert!(t.pending_countries().is_empty());
    }

    #[test]
    fn private_peers_never_pending_for_country() {
        let mut t = HostUsageTracker::new();
        t.ingest(vec![
            PeerReading { conn_key: "a".into(), app: "app".into(), ip: "192.168.1.5".into(), rx: 10, tx: 0, pid: None },
            PeerReading { conn_key: "b".into(), app: "app".into(), ip: "140.82.113.25".into(), rx: 10, tx: 0, pid: None },
        ]);
        // Only the public peer awaits a country lookup.
        assert_eq!(t.pending_countries(), vec!["140.82.113.25".to_string()]);
        // But both await a reverse-DNS attempt.
        let mut pending = t.pending_hostnames();
        pending.sort();
        assert_eq!(pending, vec!["140.82.113.25".to_string(), "192.168.1.5".to_string()]);
    }

    #[test]
    fn joins_resolved_hostname_and_country() {
        let mut t = HostUsageTracker::new();
        t.ingest(vec![PeerReading {
            conn_key: "a".into(),
            app: "firefox".into(),
            ip: "140.82.113.25".into(),
            rx: 10,
            tx: 0,
            pid: None,
        }]);
        t.record_hostnames(HashMap::from([("140.82.113.25".into(), Some("lb.github.com".into()))]));
        t.record_countries(HashMap::from([("140.82.113.25".into(), Some("US".into()))]));
        let s = t.summary();
        let host = &s.apps[0].hosts[0];
        assert_eq!(host.host.as_deref(), Some("lb.github.com"));
        assert_eq!(host.country_code.as_deref(), Some("US"));
    }

    #[test]
    fn ip_classification() {
        assert!(ip_is_public("140.82.113.25"));
        assert!(!ip_is_public("192.168.1.1"));
        assert!(!ip_is_public("10.0.0.1"));
        assert!(!ip_is_public("100.64.0.1")); // CGNAT
        assert!(!ip_is_public("127.0.0.1"));
        assert!(ip_is_public("2606:4700::1111"));
        assert!(!ip_is_public("fe80::1")); // link-local
        assert!(!ip_is_public("fc00::1")); // unique-local
    }

    #[test]
    fn strips_ports_across_formats() {
        assert_eq!(strip_port("1.2.3.4:443").as_deref(), Some("1.2.3.4"));
        assert_eq!(strip_port("[2606::1]:443").as_deref(), Some("2606::1"));
        assert_eq!(strip_port("2606:4700::1111.443").as_deref(), Some("2606:4700::1111"));
        assert_eq!(peer_ip("*:*"), None);
        assert_eq!(peer_ip("127.0.0.1:80"), None);
    }
}
