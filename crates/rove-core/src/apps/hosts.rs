//! Per-app remote hosts and traffic kinds: which hosts each app talks to, and
//! how much. [`crate::apps`] keeps one total per process; this keeps the
//! same traffic split by the peer on the other end of each connection, for the
//! Hosts view (hostname, country flag, bytes) and, bucketed by peer port, the
//! Traffic Types view.
//!
//! The sources are the per-connection ones the OS already exposes:
//!
//!   * **Linux**: `ss -tinHp`, each TCP socket's address pair, owning process
//!     and `bytes_sent`/`bytes_received`. TCP only, like Linux app metering, so
//!     the two views still agree; UDP/QUIC per host is future work.
//!   * **macOS**: `nettop` without `-P`, a row per process then a row per
//!     connection (`tcp4 local<->peer …`, `udp4 …` for QUIC) with that
//!     connection's cumulative bytes.
//!   * **Windows**: the Kernel-Network ETW events carry the remote address next
//!     to the PID and size, so the admin-only session behind
//!     [`crate::apps`] feeds this view too. TCP and UDP alike.
//!   * **other**: no per-connection source, so unsupported.
//!
//! Every source gives a cumulative counter per connection, so
//! [`HostUsageTracker`] banks each connection's delta into a per-`(app, peer
//! ip)` total.
//!
//! Hostnames (reverse DNS) and countries ([`crate::utils::geoip`], a bundled
//! table, so no per-peer network call) are resolved outside the tracker. It
//! lists the IPs still waiting ([`HostUsageTracker::pending_hostnames`],
//! [`HostUsageTracker::pending_countries`]) and caches the answers, misses
//! included ([`HostUsageTracker::record_hostnames`],
//! [`HostUsageTracker::record_countries`]), so each peer is resolved at most
//! once.

use crate::apps::CounterSemantics;
use crate::apps::Support;
use crate::usage::ByteCounts;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

/// One remote host an app has exchanged bytes with this session, summed over
/// every connection to that IP. `host` and `country_code` are resolved after
/// the peer is first seen, so both start as `None`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostUsage {
    /// Remote peer IP, no port: the host's identity across samples.
    pub ip: String,
    /// Reverse-DNS hostname; `None` until resolved, or when there's no PTR.
    pub host: Option<String>,
    /// ISO 3166 alpha-2 country code (e.g. "US"); `None` until resolved, for a
    /// private or reserved address, or when the table has no record.
    pub country_code: Option<String>,
    pub rx_bytes: u64,
    pub tx_bytes: u64,
}

/// One application with the remote hosts it has talked to, busiest host first.
/// `rx_bytes`/`tx_bytes` sum its hosts. They track the same app's
/// [`AppUsage`](crate::apps::AppUsage) closely: both bank per-socket
/// deltas from the same protocols and drop the same peers
/// (`utils::net::routable_peer_ip`). They differ slightly while traffic flows,
/// because the two samplers run on their own intervals, and converge when it's
/// quiet.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppHosts {
    pub name: String,
    /// The app's OS icon as a `data:` URI; see
    /// [`AppUsage::icon`](crate::apps::AppUsage::icon).
    pub icon: Option<String>,
    pub rx_bytes: u64,
    pub tx_bytes: u64,
    pub hosts: Vec<HostUsage>,
}

/// Per-app remote hosts for the Hosts view. Same shape as
/// [`AppUsageSummary`](crate::apps::AppUsageSummary) (busiest first,
/// `support`, `tracking_since`) so the frontend treats them alike.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostUsageSummary {
    pub apps: Vec<AppHosts>,
    /// See [`platform_support`].
    pub support: Support,
    pub tracking_since: Option<u64>,
}

/// One kind of traffic: the connections grouped by their peer (service) port,
/// e.g. HTTPS on 443 or DNS on 53.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrafficType {
    /// Stable slug the frontend keys an icon off (`"https"`, `"dns"`, `"other"`, …).
    pub id: &'static str,
    /// Display name for the bucket (`"HTTPS"`, `"DNS"`, …).
    pub label: &'static str,
    pub rx_bytes: u64,
    pub tx_bytes: u64,
}

/// Traffic by kind for the Traffic Types view, busiest first. Grouped from the
/// same per-connection samples as [`HostUsageSummary`], so it covers exactly
/// the same traffic, bucketed by peer port instead of peer IP.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrafficUsageSummary {
    /// Per-kind totals, busiest first. Empty before the first sample.
    pub types: Vec<TrafficType>,
    /// See [`platform_support`].
    pub support: Support,
    pub tracking_since: Option<u64>,
}

/// The same as [`crate::apps::platform_support`]: on Windows both views
/// read the one ETW session, so they need administrator rights and light up
/// together.
pub fn platform_support() -> Support {
    crate::apps::sys::support()
}

/// One snapshot of per-connection cumulative byte counters, tagged with the
/// peer.
///
/// `None` means no sample was taken (tool missing, failed, timed out, or an
/// unsupported platform); `Some(vec![])` means no connected sockets. Keep them
/// apart, as in [`crate::apps::sample_units`]: ingesting a failure as
/// empty would drop every baseline and re-credit each counter in full next
/// tick.
pub async fn sample() -> Option<Vec<PeerReading>> {
    crate::apps::sys::sample_peers().await
}

/// One cumulative reading for a single connection. `conn_key` identifies the
/// connection across samples (its address pair) so the tracker can diff it;
/// `ip` is the peer without its port, the host grouping key.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PeerReading {
    pub conn_key: String,
    pub app: String,
    pub ip: String,
    /// The peer's service port (443, 53, …), which picks the traffic type.
    /// `None` when the source gave no readable port; it lands in "other".
    pub port: Option<u16>,
    pub rx: u64,
    pub tx: u64,
    /// Owning process id, when the source gives one. Only used to resolve the
    /// app icon; accounting stays keyed by `conn_key`.
    pub pid: Option<u32>,
}

/// Whether a peer IP is public. Private, carrier-NAT, link-local and reserved
/// ranges have no meaningful country, so they're never geolocated.
fn ip_is_public(ip: &str) -> bool {
    match ip.parse::<IpAddr>() {
        Ok(IpAddr::V4(v4)) => v4_is_public(v4),
        Ok(IpAddr::V6(v6)) => v6_is_public(v6),
        Err(_) => false,
    }
}

fn v4_is_public(v4: Ipv4Addr) -> bool {
    let [a, b, ..] = v4.octets();
    // 100.64.0.0/10, carrier-grade NAT, which `is_private` doesn't cover.
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

/// A traffic-type bucket; see [`TrafficType`].
#[derive(Clone, Copy)]
struct TrafficClass {
    id: &'static str,
    label: &'static str,
}

/// Everything not on the list in [`classify_port`]: ephemeral ports,
/// unrecognised services and readings with no port. A catch-all, not a guess.
const OTHER: TrafficClass = TrafficClass { id: "other", label: "Other" };

const fn cls(id: &'static str, label: &'static str) -> TrafficClass {
    TrafficClass { id, label }
}

/// Bucket a connection by its peer (service) port. Only ports Rove can see are
/// listed: broadcast and multicast chatter (mDNS, SSDP, NetBIOS names, DHCP)
/// has wildcard peers and is dropped upstream. Plaintext and TLS members of a
/// family (IMAP/IMAPS, SMTP/submission) share a bucket.
///
/// The list favours ports that carry volume (file shares, tunnels, media,
/// torrents, databases) so they don't swell "Other"; rare low-traffic control
/// ports fall through.
fn classify_port(port: Option<u16>) -> TrafficClass {
    match port {
        // HTTPS and HTTP/3 (QUIC) both ride 443; plaintext HTTP and its common
        // alternates the rest.
        Some(443 | 8443) => cls("https", "HTTPS"),
        Some(80 | 8080 | 8000 | 8888) => cls("http", "HTTP"),
        // DNS proper (53) and DNS-over-TLS (853); DoH is just HTTPS on 443.
        Some(53 | 853) => cls("dns", "DNS"),
        Some(22) => cls("ssh", "SSH"),
        Some(21 | 989 | 990) => cls("ftp", "FTP"),
        // Mail: submission/SMTP and IMAP(S)/POP3(S), plaintext and TLS together.
        Some(25 | 465 | 587 | 143 | 993 | 110 | 995) => cls("email", "Email"),
        Some(123) => cls("ntp", "NTP"),
        // NAT traversal for real-time media (WebRTC, VoIP, games).
        Some(3478 | 5349) => cls("stun", "STUN/TURN"),
        // Vendor push keepalives: Apple (5223), Google GCM/FCM (5228).
        Some(5223 | 5228) => cls("push", "Push"),
        // Databases: MSSQL, MySQL, Postgres, Redis, MongoDB, CouchDB, Cassandra.
        Some(1433 | 3306 | 5432 | 6379 | 27017 | 5984 | 9042) => cls("database", "Database"),
        // Encrypted tunnels: OpenVPN, IPsec (IKE/NAT-T), L2TP, PPTP, WireGuard.
        Some(1194 | 500 | 4500 | 1701 | 1723 | 51820) => cls("vpn", "VPN"),
        // Streaming media transport: RTMP and RTSP.
        Some(1935 | 554) => cls("media", "Streaming media"),
        // Remote desktop: RDP and VNC.
        Some(3389 | 5900) => cls("remote", "Remote desktop"),
        // SMB, NFS and the NetBIOS session service (TCP :139). NetBIOS
        // :137/:138 are UDP broadcast and never get here.
        Some(445 | 2049 | 139) => cls("fileshare", "File sharing"),
        // BitTorrent's default client-port range.
        Some(6881..=6889) => cls("p2p", "Peer-to-peer"),
        // Chat: XMPP (5222) and IRC (6667 plaintext, 6697 TLS).
        Some(5222 | 6667 | 6697) => cls("messaging", "Messaging"),
        _ => OTHER,
    }
}

/// Turns per-connection cumulative counters into per-`(app, peer ip)` running
/// totals. `last` is the previous reading per connection, to diff against;
/// `totals` is bytes per app, then per peer. The hostname and country caches
/// are filled from outside and joined in at [`summary`](Self::summary) time.
#[derive(Default)]
pub struct HostUsageTracker {
    last: HashMap<String, ByteCounts>,
    totals: HashMap<String, HashMap<String, ByteCounts>>,
    /// Totals by traffic type ([`classify_port`]), banked from the same deltas
    /// as `totals` so the Traffic Types and Hosts views agree. Keyed by class
    /// `id`.
    by_traffic_type: HashMap<&'static str, (TrafficClass, ByteCounts)>,
    /// Epoch ms of the first snapshot; `None` until one arrives.
    tracking_since: Option<u64>,
    /// App icon per app name, misses cached as `None` (as in [`crate::apps`]).
    icons: HashMap<String, Option<String>>,
    /// Reverse-DNS hostname per peer IP. A key means "already tried"; `None` is
    /// a cached miss (no PTR), so it isn't retried every tick.
    hostnames: HashMap<String, Option<String>>,
    /// Country code per peer IP. A key means "already resolved"; private
    /// addresses are seeded `None` at ingest so they're never looked up.
    countries: HashMap<String, Option<String>>,
}

/// How this platform's readings are banked. Linux and macOS read live OS socket
/// counters ([`CounterSemantics::Socket`]), which carry history from before
/// launch and so are primed. Windows reads a zero-based ETW accumulator Rove
/// started itself ([`CounterSemantics::PidAccumulator`]), so its first sample
/// is all watched traffic and must not be primed away.
const fn peer_counter_semantics() -> CounterSemantics {
    #[cfg(windows)]
    {
        CounterSemantics::PidAccumulator
    }
    #[cfg(not(windows))]
    {
        CounterSemantics::Socket
    }
}

impl HostUsageTracker {
    pub fn new() -> Self {
        Self::default()
    }

    /// Fold one successful snapshot into the running totals: credit each
    /// connection's growth since its last reading, and forget connections that
    /// vanished (their bytes are already in `totals`).
    ///
    /// Every platform keys this per connection (an address pair, or nettop's
    /// `local<->peer` label), so a decrease means a recycled key, not a closed
    /// socket. Banking follows `peer_counter_semantics`, the same rule the Apps
    /// view uses: on Linux and macOS the first snapshot only sets baselines,
    /// because connections open at launch carry traffic from before Rove was
    /// watching. Skipping that would bank history the Apps view discards, and an
    /// app could show here having never appeared there.
    ///
    /// Only pass a snapshot that was actually taken; see [`sample`].
    pub fn ingest(&mut self, readings: Vec<PeerReading>) {
        let first_snapshot = self.tracking_since.is_none();
        if first_snapshot {
            self.tracking_since = Some(crate::utils::net::now_ms());
        }
        let semantics = peer_counter_semantics();
        let priming = first_snapshot && semantics.primes_on_first_snapshot();

        let mut seen = HashSet::with_capacity(readings.len());
        for reading in readings {
            let prev = self.last.get(&reading.conn_key).copied();
            let (rx_delta, tx_delta) = if priming {
                (0, 0)
            } else {
                (semantics.credit(reading.rx, prev.map(|p| p.rx)), semantics.credit(reading.tx, prev.map(|p| p.tx)))
            };

            self.last.insert(reading.conn_key.clone(), ByteCounts { rx: reading.rx, tx: reading.tx });
            seen.insert(reading.conn_key);

            // Once per name. Skipped under cfg(test) so the accounting tests
            // don't call into the OS icon APIs.
            if !self.icons.contains_key(&reading.app) {
                #[cfg(not(test))]
                let icon = crate::platform::app_icon::app_icon_data_uri(&reading.app, reading.pid);
                #[cfg(test)]
                let icon: Option<String> = None;
                self.icons.insert(reading.app.clone(), icon);
            }

            // Seed a miss for private and reserved peers so they're never
            // geolocated. The table has no record for most, but CGNAT and other
            // shared ranges can have one, and the carrier's country says nothing
            // about the peer.
            if !ip_is_public(&reading.ip) {
                self.countries.entry(reading.ip.clone()).or_insert(None);
            }

            // The same delta, by traffic type, so the two views can't disagree
            // about how much moved.
            let class = classify_port(reading.port);
            let (_, by_type) = self.by_traffic_type.entry(class.id).or_insert((class, ByteCounts::default()));
            by_type.rx = by_type.rx.saturating_add(rx_delta);
            by_type.tx = by_type.tx.saturating_add(tx_delta);

            let by_ip = self.totals.entry(reading.app).or_default();
            let entry = by_ip.entry(reading.ip).or_default();
            entry.rx = entry.rx.saturating_add(rx_delta);
            entry.tx = entry.tx.saturating_add(tx_delta);
        }
        self.last.retain(|key, _| seen.contains(key));
    }

    /// Peer IPs not yet reverse-resolved, for the caller to look up in a batch
    /// and hand back via [`Self::record_hostnames`].
    pub fn pending_hostnames(&self) -> Vec<String> {
        self.known_ips().filter(|ip| !self.hostnames.contains_key(*ip)).cloned().collect()
    }

    /// Public peer IPs not yet geolocated, for the caller to resolve via
    /// [`crate::utils::geoip`] and hand back via [`Self::record_countries`].
    pub fn pending_countries(&self) -> Vec<String> {
        self.known_ips().filter(|ip| !self.countries.contains_key(*ip)).cloned().collect()
    }

    fn known_ips(&self) -> impl Iterator<Item = &String> {
        self.totals.values().flat_map(HashMap::keys)
    }

    /// Record reverse-DNS results (`None` for no PTR). Misses are cached too, so
    /// each IP is resolved at most once.
    pub fn record_hostnames(&mut self, resolved: HashMap<String, Option<String>>) {
        self.hostnames.extend(resolved);
    }

    /// Record country codes (`None` when the table has no country). Misses are
    /// cached too: the lookup is a local table read, so a miss won't change on
    /// a retry.
    pub fn record_countries(&mut self, resolved: HashMap<String, Option<String>>) {
        self.countries.extend(resolved);
    }

    /// Per-app remote hosts, busiest app and host first, without the ones that
    /// moved nothing.
    pub fn summary(&self) -> HostUsageSummary {
        let mut apps: Vec<AppHosts> = self
            .totals
            .iter()
            .filter_map(|(name, by_ip)| {
                let mut hosts: Vec<HostUsage> = by_ip
                    .iter()
                    .filter(|(_, b)| b.rx > 0 || b.tx > 0)
                    .map(|(ip, b)| HostUsage {
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
                    (b.rx_bytes + b.tx_bytes).cmp(&(a.rx_bytes + a.tx_bytes)).then_with(|| a.ip.cmp(&b.ip))
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
            (b.rx_bytes + b.tx_bytes).cmp(&(a.rx_bytes + a.tx_bytes)).then_with(|| a.name.cmp(&b.name))
        });

        HostUsageSummary { apps, support: platform_support(), tracking_since: self.tracking_since }
    }

    /// Traffic by kind, busiest first, without empty buckets.
    pub fn traffic_summary(&self) -> TrafficUsageSummary {
        let mut types: Vec<TrafficType> = self
            .by_traffic_type
            .values()
            .filter(|(_, b)| b.rx > 0 || b.tx > 0)
            .map(|(class, b)| TrafficType { id: class.id, label: class.label, rx_bytes: b.rx, tx_bytes: b.tx })
            .collect();
        types.sort_by(|a, b| {
            (b.rx_bytes + b.tx_bytes).cmp(&(a.rx_bytes + a.tx_bytes)).then_with(|| a.label.cmp(b.label))
        });
        TrafficUsageSummary { types, support: platform_support(), tracking_since: self.tracking_since }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::apps::macos::parse_nettop_peers;

    #[test]
    fn nettop_ipv6_peer_port_stripped() {
        let out = "\
time,,interface,state,bytes_in,bytes_out
16:00:00.0,Safari.900,,,10,20
16:00:00.0,tcp6 2606:4700::1.55123<->2606:4700::1111.443,en0,Established,10,20";
        let r = parse_nettop_peers(out);
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].ip, "2606:4700::1111");
        assert_eq!(r[0].port, Some(443));
    }

    #[test]
    fn accumulates_per_app_per_host_deltas() {
        let mut t = HostUsageTracker::new();
        // First snapshot: baseline only, for both already-open sockets.
        t.ingest(vec![
            PeerReading {
                conn_key: "s1".into(),
                app: "firefox".into(),
                ip: "1.1.1.1".into(),
                port: Some(443),
                rx: 100,
                tx: 40,
                pid: None,
            },
            PeerReading {
                conn_key: "s2".into(),
                app: "firefox".into(),
                ip: "1.1.1.1".into(),
                port: Some(443),
                rx: 50,
                tx: 10,
                pid: None,
            },
        ]);
        // s1 grows (credit delta), s2 unchanged, plus a new host for firefox on
        // a connection opened since the last tick (credited in full).
        t.ingest(vec![
            PeerReading {
                conn_key: "s1".into(),
                app: "firefox".into(),
                ip: "1.1.1.1".into(),
                port: Some(443),
                rx: 250,
                tx: 90,
                pid: None,
            },
            PeerReading {
                conn_key: "s2".into(),
                app: "firefox".into(),
                ip: "1.1.1.1".into(),
                port: Some(443),
                rx: 50,
                tx: 10,
                pid: None,
            },
            PeerReading {
                conn_key: "s3".into(),
                app: "firefox".into(),
                ip: "8.8.8.8".into(),
                port: Some(53),
                rx: 500,
                tx: 0,
                pid: None,
            },
        ]);
        let s = t.summary();
        assert_eq!(s.apps.len(), 1);
        let firefox = &s.apps[0];
        // Busiest host (8.8.8.8, 500) first. 1.1.1.1 carries only s1's growth;
        // neither socket's pre-baseline history is banked.
        assert_eq!(firefox.hosts[0].ip, "8.8.8.8");
        assert_eq!(firefox.hosts[1].ip, "1.1.1.1");
        assert_eq!(firefox.hosts[1].rx_bytes, 150);
        assert_eq!(firefox.hosts[1].tx_bytes, 50);
        assert_eq!(firefox.rx_bytes, 500 + 150);

        // The same growth by service port: DNS (500, s3 on :53) ahead of HTTPS
        // (150 + 50, the :443 sockets).
        let tt = t.traffic_summary();
        assert_eq!(tt.types.len(), 2);
        assert_eq!(tt.types[0].id, "dns");
        assert_eq!(tt.types[0].rx_bytes, 500);
        assert_eq!(tt.types[1].id, "https");
        assert_eq!(tt.types[1].rx_bytes, 150);
        assert_eq!(tt.types[1].tx_bytes, 50);
    }

    /// The Hosts view primes like the Apps view. Without it a connection open at
    /// launch banks its whole counter, and the app shows on Hosts, inflated,
    /// having never appeared on Apps.
    #[test]
    fn primes_on_the_first_snapshot() {
        let mut t = HostUsageTracker::new();
        let tick = |rx: u64, tx: u64| {
            vec![PeerReading {
                conn_key: "c1".into(),
                app: "Browser Helper".into(),
                ip: "140.82.113.25".into(),
                port: Some(443),
                rx,
                tx,
                pid: None,
            }]
        };
        // A browser connection 162 MB into its life when Rove starts watching.
        t.ingest(tick(162_000_000, 4_000_000));
        assert!(t.summary().apps.is_empty(), "history from before the first snapshot was banked");

        // Only what it moves from there on counts.
        t.ingest(tick(162_000_800, 4_000_200));
        let host = &t.summary().apps[0].hosts[0];
        assert_eq!(host.rx_bytes, 800);
        assert_eq!(host.tx_bytes, 200);
    }

    #[test]
    fn resolves_countries_end_to_end_through_the_bundled_table() {
        // What `spawn_host_usage_sampler` runs each tick, minus tokio: ingest,
        // pending_countries, geoip, record_countries, summary. The other tests
        // stub the country, so only this catches the halves wired up wrong.
        let mut t = HostUsageTracker::new();
        t.ingest(vec![
            PeerReading {
                conn_key: "a".into(),
                app: "firefox".into(),
                ip: "8.8.8.8".into(),
                port: Some(53),
                rx: 10,
                tx: 0,
                pid: None,
            },
            PeerReading {
                conn_key: "b".into(),
                app: "firefox".into(),
                ip: "192.168.1.5".into(),
                port: Some(53),
                rx: 5,
                tx: 0,
                pid: None,
            },
        ]);
        // Past the baseline, so both peers have bytes and reach the summary.
        t.ingest(vec![
            PeerReading {
                conn_key: "a".into(),
                app: "firefox".into(),
                ip: "8.8.8.8".into(),
                port: Some(53),
                rx: 20,
                tx: 0,
                pid: None,
            },
            PeerReading {
                conn_key: "b".into(),
                app: "firefox".into(),
                ip: "192.168.1.5".into(),
                port: Some(53),
                rx: 15,
                tx: 0,
                pid: None,
            },
        ]);

        let resolved: HashMap<String, Option<String>> = t
            .pending_countries()
            .into_iter()
            .map(|ip| {
                let code = crate::utils::geoip::country_code(&ip);
                (ip, code)
            })
            .collect();
        t.record_countries(resolved);

        let hosts = &t.summary().apps[0].hosts;
        let public = hosts.iter().find(|h| h.ip == "8.8.8.8").expect("public peer in summary");
        let private = hosts.iter().find(|h| h.ip == "192.168.1.5").expect("private peer in summary");
        assert_eq!(public.country_code.as_deref(), Some("US"));
        // The LAN peer is still listed, just without a flag.
        assert_eq!(private.country_code, None);

        // One pass clears the whole backlog.
        assert!(t.pending_countries().is_empty());
    }

    #[test]
    fn private_peers_never_pending_for_country() {
        let mut t = HostUsageTracker::new();
        t.ingest(vec![
            PeerReading {
                conn_key: "a".into(),
                app: "app".into(),
                ip: "192.168.1.5".into(),
                port: Some(53),
                rx: 10,
                tx: 0,
                pid: None,
            },
            PeerReading {
                conn_key: "b".into(),
                app: "app".into(),
                ip: "140.82.113.25".into(),
                port: Some(443),
                rx: 10,
                tx: 0,
                pid: None,
            },
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
        let tick = |rx: u64| {
            vec![PeerReading {
                conn_key: "a".into(),
                app: "firefox".into(),
                ip: "140.82.113.25".into(),
                port: Some(443),
                rx,
                tx: 0,
                pid: None,
            }]
        };
        t.ingest(tick(0)); // baseline snapshot
        t.ingest(tick(10));
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
    fn classifies_ports_into_traffic_types() {
        // Well-known service ports map to their family; encrypted and plaintext
        // members share one bucket.
        assert_eq!(classify_port(Some(443)).id, "https");
        assert_eq!(classify_port(Some(80)).id, "http");
        assert_eq!(classify_port(Some(53)).id, "dns");
        assert_eq!(classify_port(Some(853)).id, "dns");
        assert_eq!(classify_port(Some(22)).id, "ssh");
        assert_eq!(classify_port(Some(993)).id, "email");
        assert_eq!(classify_port(Some(5223)).id, "push");
        // The widened buckets that used to fall into "other".
        assert_eq!(classify_port(Some(5432)).id, "database"); // Postgres
        assert_eq!(classify_port(Some(51820)).id, "vpn"); // WireGuard
        assert_eq!(classify_port(Some(1935)).id, "media"); // RTMP
        assert_eq!(classify_port(Some(3389)).id, "remote"); // RDP
        assert_eq!(classify_port(Some(445)).id, "fileshare"); // SMB
        assert_eq!(classify_port(Some(6881)).id, "p2p"); // BitTorrent (range)
        assert_eq!(classify_port(Some(6889)).id, "p2p"); // range upper bound
        assert_eq!(classify_port(Some(5222)).id, "messaging"); // XMPP
                                                               // Ephemeral / unrecognised / missing ports still fall through to "other".
        assert_eq!(classify_port(Some(54312)).id, "other");
        assert_eq!(classify_port(None).id, "other");
    }

    #[test]
    fn unclassified_ports_bank_into_the_other_bucket() {
        let mut t = HostUsageTracker::new();
        let tick = |rx: u64| {
            vec![PeerReading {
                conn_key: "p".into(),
                app: "some-daemon".into(),
                ip: "203.0.113.7".into(),
                port: Some(48211), // ephemeral, not a known service
                rx,
                tx: 0,
                pid: None,
            }]
        };
        t.ingest(tick(0)); // baseline
        t.ingest(tick(1000));
        let tt = t.traffic_summary();
        assert_eq!(tt.types.len(), 1);
        assert_eq!(tt.types[0].id, "other");
        assert_eq!(tt.types[0].label, "Other");
        assert_eq!(tt.types[0].rx_bytes, 1000);
    }
}
