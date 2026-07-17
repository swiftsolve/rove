//! Per-app *remote host* attribution — "which hosts is each app talking to, and
//! how much". Where [`crate::app_usage`] answers "how many bytes has this app
//! moved" (a per-process total), this module keeps the traffic broken down by
//! the remote peer on the other end of each connection, so the Hosts view can
//! show, under each app, the hosts it reached with a hostname, country flag, and
//! byte split.
//!
//! It reuses the same peer-address sources the OS already exposes — no packet
//! capture, no elevated privileges:
//!
//!   * **Linux** — `ss -tinHp` lists each TCP socket with its `LOCAL`/`PEER`
//!     address pair and the owning process, plus `bytes_sent`/`bytes_received`.
//!     (TCP only — Linux app-byte metering is likewise TCP-only, so the two
//!     views still agree; UDP/QUIC per-host attribution on Linux is future work.)
//!   * **macOS** — `nettop` *without* `-P` prints one row per process followed
//!     by a row per connection (`tcp4 local<->peer …`, and `udp4 …` for QUIC)
//!     carrying that connection's cumulative byte counts. Every protocol with a
//!     concrete peer is attributed, so this matches the byte-total view's
//!     coverage rather than trailing it by the QUIC volume.
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

use crate::app_usage::CounterSemantics;
use crate::net_util::{peer_port, routable_peer_ip};
use crate::types::{AppHosts, HostConn, HostUsageSummary, TrafficType, TrafficUsageSummary};
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
    /// The peer's (service) port — 443, 53, … — used to bucket the connection
    /// into a traffic type. `None` when the source token carried no readable
    /// port, in which case it falls into the "other" bucket.
    pub port: Option<u16>,
    pub rx: u64,
    pub tx: u64,
    /// Owning process id when the source reports one (macOS), used to resolve
    /// the app icon; `None` on Linux (keyed by socket, no icon lookup).
    pub pid: Option<u32>,
}

/// Take one snapshot of per-connection cumulative byte counters, tagged with the
/// remote peer.
///
/// `None` means no sample was taken (source tool missing, errored, timed out, or
/// an unsupported platform); `Some(vec![])` means the sample worked and there
/// were no connected sockets. As in [`crate::app_usage::sample_units`], the two
/// must not be conflated: ingesting a failure as an empty snapshot would forget
/// every socket's baseline and re-credit each one's full counter next tick.
pub async fn sample() -> Option<Vec<PeerReading>> {
    #[cfg(target_os = "linux")]
    {
        return crate::shell::try_run("ss -tinHp").await.map(|out| parse_ss_peers(&out));
    }
    // No -P: nettop prints per-connection sub-rows (peer + per-conn bytes) under
    // each process row. No -m either: the default lists TCP *and* UDP, so QUIC
    // (HTTP/3, on :443) is attributed to its host like any TCP flow. Unconnected
    // UDP — mDNS, DNS listeners — has a `*` peer and is dropped by
    // `routable_peer_ip`, the same gate the byte-total view uses. -x raw bytes,
    // -n no DNS (we do our own reverse lookup).
    #[cfg(target_os = "macos")]
    {
        return crate::shell::try_run("nettop -L 1 -x -n")
            .await
            .map(|out| parse_nettop_peers(&out));
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        None
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
    // (app, conn_key, peer_ip, peer_port) awaiting its following info line.
    let mut pending: Option<(String, String, String, Option<u16>)> = None;

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        if trimmed.contains("bytes_sent:") || trimmed.contains("bytes_received:") {
            if let Some((app, conn_key, ip, port)) = pending.take() {
                let tx = field_u64(trimmed, "bytes_sent:").unwrap_or(0);
                let rx = field_u64(trimmed, "bytes_received:").unwrap_or(0);
                readings.push(PeerReading { conn_key, app, ip, port, rx, tx, pid: None });
            }
            continue;
        }

        pending = match ss_proc_name(trimmed) {
            Some(app) => {
                let mut cols = trimmed.split_whitespace();
                let local = cols.nth(3);
                let peer = cols.next();
                match (local, peer, peer.and_then(routable_peer_ip)) {
                    (Some(local), Some(peer), Some(ip)) => {
                        Some((app, format!("{local}|{peer}"), ip, peer_port(peer)))
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

/// Parse `nettop -L 1 -x -n` (no `-P`, no `-m`). Output alternates a process row
/// (`name.pid,,,bytes_in,bytes_out,…`) with the connection rows beneath it
/// (`tcp4 local<->peer,iface,state,bytes_in,bytes_out,…`, and `udp4 …` for QUIC
/// and other connected UDP). The process row sets the owning app for the
/// connection rows that follow, until the next process row. Connections without
/// a routable peer (listeners, `*` wildcards, loopback) are skipped.
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

        // A connection row: "tcpN/udpN local<->peer". Attribute it to the
        // current process; pull its per-connection byte columns.
        if let Some((_, peer)) = label.split_once("<->") {
            let Some((app, pid)) = &current else { continue };
            let peer = peer.trim();
            let Some(ip) = routable_peer_ip(peer) else { continue };
            let rx = fields.get(4).and_then(|f| f.trim().parse::<u64>().ok());
            let tx = fields.get(5).and_then(|f| f.trim().parse::<u64>().ok());
            let (Some(rx), Some(tx)) = (rx, tx) else { continue };
            readings.push(PeerReading {
                conn_key: label.to_string(),
                app: app.clone(),
                ip,
                port: peer_port(peer),
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

/// A traffic-type bucket: a stable `id` slug (what the frontend keys an icon
/// off) and a human `label`. Both are static — the set of buckets is fixed.
#[derive(Clone, Copy)]
struct TrafficClass {
    id: &'static str,
    label: &'static str,
}

/// Everything not on the well-known list below. Ephemeral-port peers,
/// unrecognised services, and readings whose source token carried no port all
/// land here — an honest catch-all rather than a guess.
const OTHER: TrafficClass = TrafficClass { id: "other", label: "Other" };

const fn cls(id: &'static str, label: &'static str) -> TrafficClass {
    TrafficClass { id, label }
}

/// Bucket a connection by its peer (service) port. Only ports Rove can actually
/// observe are listed — this reads the same TCP + connected-UDP samples the
/// hosts view does, so LAN broadcast/multicast chatter (mDNS, SSDP, NetBIOS
/// name service, DHCP) never reaches here; those sockets have wildcard peers and
/// are dropped upstream. Grouping is by service, so the encrypted and plaintext
/// members of a protocol family (IMAP/IMAPS, submission/SMTP) share one bucket.
///
/// The list favours ports that carry real *volume* — the point of a byte
/// breakdown — so the heavy hitters that would otherwise swell "Other" (file
/// shares, tunnels, media, torrents, databases) get named, while rare
/// low-traffic control ports are left to fall through.
fn classify_port(port: Option<u16>) -> TrafficClass {
    match port {
        // The web, by far the bulk of it: HTTPS and HTTP/3 (QUIC) both ride 443,
        // plaintext HTTP and its common alternates on the rest.
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
        // Network file sharing: SMB, NFS, NetBIOS session (the TCP one, :139 —
        // the :137/:138 name/datagram services are UDP broadcast, dropped above).
        Some(445 | 2049 | 139) => cls("fileshare", "File sharing"),
        // BitTorrent's default client-port range.
        Some(6881..=6889) => cls("p2p", "Peer-to-peer"),
        // Chat: XMPP (5222) and IRC (6667 plaintext, 6697 TLS).
        Some(5222 | 6667 | 6697) => cls("messaging", "Messaging"),
        _ => OTHER,
    }
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
    /// Running totals bucketed by traffic type (see [`classify_port`]), banked
    /// from the very same per-socket deltas as `totals` so the Traffic Types
    /// view and the Hosts view stay in step. Keyed by the class `id`; the label
    /// rides in the value so `traffic_summary` needn't re-derive it.
    protocols: HashMap<&'static str, (TrafficClass, ByteCounts)>,
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

    /// Fold one successful snapshot into the running totals: credit each socket's
    /// growth since its last reading, and forget sockets that vanished (their
    /// bytes are already banked in `totals`).
    ///
    /// Unlike [`crate::app_usage`], this path is socket-keyed on *both*
    /// platforms — Linux `ss` by address pair, macOS `nettop` without `-P` by its
    /// `local<->peer` label — so every reading here is
    /// [`crate::app_usage::CounterSemantics::Socket`] and a decrease really does
    /// mean a recycled address pair rather than a closed socket. Don't port
    /// app_usage's macOS process-aggregate handling over; it would be wrong here.
    ///
    /// What *does* carry over is priming: the first snapshot only sets baselines
    /// ([`crate::app_usage::CounterSemantics::primes_on_first_snapshot`]), because
    /// the connections already established at launch arrive holding however much
    /// they moved before Rove existed. Without it this view banks that history
    /// while the Apps view discards it, and the same app reads as busier here than
    /// there — or shows up here having never appeared there at all.
    ///
    /// Only ever pass a snapshot that was actually taken — see [`sample`].
    pub fn ingest(&mut self, readings: Vec<PeerReading>) {
        let first_snapshot = self.since.is_none();
        if first_snapshot {
            self.since = Some(crate::net_util::now_ms());
        }
        let priming = first_snapshot && CounterSemantics::Socket.primes_on_first_snapshot();

        let mut seen = HashSet::with_capacity(readings.len());
        for reading in readings {
            let prev = self.last.get(&reading.conn_key).copied();
            let (drx, dtx) = if priming {
                (0, 0)
            } else {
                (
                    CounterSemantics::Socket.credit(reading.rx, prev.map(|p| p.rx)),
                    CounterSemantics::Socket.credit(reading.tx, prev.map(|p| p.tx)),
                )
            };

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

            // Bucket the same delta by traffic type. Uses the connection's peer
            // port, so it's the identical growth being banked here and per-host —
            // the two views can't disagree about how much moved.
            let class = classify_port(reading.port);
            let proto = self.protocols.entry(class.id).or_insert((class, ByteCounts::default()));
            proto.1.rx = proto.1.rx.saturating_add(drx);
            proto.1.tx = proto.1.tx.saturating_add(dtx);

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

    /// Traffic broken down by kind, busiest first, dropping buckets that have
    /// moved nothing. Grouped from the same samples as [`summary`], so it covers
    /// exactly the same traffic — just bucketed by service port, not peer IP.
    pub fn traffic_summary(&self) -> TrafficUsageSummary {
        let mut types: Vec<TrafficType> = self
            .protocols
            .values()
            .filter(|(_, b)| b.rx > 0 || b.tx > 0)
            .map(|(class, b)| TrafficType {
                id: class.id,
                label: class.label,
                rx_bytes: b.rx,
                tx_bytes: b.tx,
            })
            .collect();
        types.sort_by(|a, b| {
            (b.rx_bytes + b.tx_bytes)
                .cmp(&(a.rx_bytes + a.tx_bytes))
                .then_with(|| a.label.cmp(b.label))
        });
        TrafficUsageSummary { types, support: platform_support(), tracking_since: self.since }
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
        assert_eq!(r[0].port, Some(443));
        assert_eq!(r[0].rx, 18422);
        assert_eq!(r[0].tx, 5231);
        // IPv6 peer in ss bracket form: IP kept without the port, port read off.
        assert_eq!(r[1].app, "spotify");
        assert_eq!(r[1].ip, "2606:4700::6810:85e5");
        assert_eq!(r[1].port, Some(443));
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
        assert_eq!(r[0].port, Some(5223));
        assert_eq!(r[0].rx, 6461);
        assert_eq!(r[0].tx, 53268);
        assert_eq!(r[0].pid, Some(375));
        assert_eq!(r[1].app, "OneDrive");
        assert_eq!(r[1].ip, "4.145.79.81");
        assert_eq!(r[1].port, Some(443));
    }

    /// QUIC (HTTP/3) is UDP to a concrete peer on :443 — real traffic to a real
    /// host, so it's attributed like any TCP flow now that the sampler drops
    /// `-m tcp`. Unconnected UDP (mDNS, `*` peer) and loopback UDP stay out.
    #[test]
    fn parses_connected_udp_and_drops_peerless_udp() {
        let out = "\
time,,interface,state,bytes_in,bytes_out
16:00:00.0,firefox.900,,,50000,9000
16:00:00.0,udp4 192.168.2.16:51094<->17.253.24.251:443,en0,,48000,8000,0
16:00:00.0,udp4 *:5353<->*:*,en0,,1000,500,0
16:00:00.0,udp4 127.0.0.1:56142<->127.0.0.1:56142,lo0,,900,900,0";
        let r = parse_nettop_peers(out);
        assert_eq!(r.len(), 1, "only the QUIC socket with a real peer is attributed");
        assert_eq!(r[0].app, "firefox");
        assert_eq!(r[0].ip, "17.253.24.251");
        assert_eq!(r[0].port, Some(443));
        assert_eq!(r[0].rx, 48000);
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
        assert_eq!(r[0].port, Some(443));
    }

    #[test]
    fn accumulates_per_app_per_host_deltas() {
        let mut t = HostUsageTracker::new();
        // First snapshot: baseline only, for both already-open sockets.
        t.ingest(vec![
            PeerReading { conn_key: "s1".into(), app: "firefox".into(), ip: "1.1.1.1".into(), port: Some(443), rx: 100, tx: 40, pid: None },
            PeerReading { conn_key: "s2".into(), app: "firefox".into(), ip: "1.1.1.1".into(), port: Some(443), rx: 50, tx: 10, pid: None },
        ]);
        // s1 grows (credit delta), s2 unchanged, plus a new host for firefox on
        // a connection opened since the last tick (credited in full).
        t.ingest(vec![
            PeerReading { conn_key: "s1".into(), app: "firefox".into(), ip: "1.1.1.1".into(), port: Some(443), rx: 250, tx: 90, pid: None },
            PeerReading { conn_key: "s2".into(), app: "firefox".into(), ip: "1.1.1.1".into(), port: Some(443), rx: 50, tx: 10, pid: None },
            PeerReading { conn_key: "s3".into(), app: "firefox".into(), ip: "8.8.8.8".into(), port: Some(53), rx: 500, tx: 0, pid: None },
        ]);
        let s = t.summary();
        assert_eq!(s.apps.len(), 1);
        let firefox = &s.apps[0];
        // Busiest host (8.8.8.8, 500) first. 1.1.1.1 carries only s1's growth —
        // neither socket's pre-baseline history is banked.
        assert_eq!(firefox.hosts[0].ip, "8.8.8.8");
        assert_eq!(firefox.hosts[1].ip, "1.1.1.1");
        assert_eq!(firefox.hosts[1].rx_bytes, 150);
        assert_eq!(firefox.hosts[1].tx_bytes, 50);
        assert_eq!(firefox.rx_bytes, 500 + 150);

        // The same growth, bucketed by service port: DNS (500, from s3 on :53)
        // ahead of HTTPS (150+50, the :443 sockets), busiest first. Neither
        // socket's pre-baseline history is banked here either.
        let tt = t.traffic_summary();
        assert_eq!(tt.types.len(), 2);
        assert_eq!(tt.types[0].id, "dns");
        assert_eq!(tt.types[0].rx_bytes, 500);
        assert_eq!(tt.types[1].id, "https");
        assert_eq!(tt.types[1].rx_bytes, 150);
        assert_eq!(tt.types[1].tx_bytes, 50);
    }

    /// The Hosts view's half of the priming contract. This view reads a different
    /// `nettop` invocation than the Apps view, and only the Apps one discards
    /// pre-launch history — so without priming here, a connection already
    /// established at launch banks its whole counter, and the app shows up on
    /// Hosts (at an inflated total) having never appeared on Apps at all.
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
        // The sequence `spawn_host_usage_sampler` runs each tick, minus tokio:
        // ingest → pending_countries → geoip → record_countries → summary. The
        // per-piece tests above stub the country in, so this is what would catch
        // the two halves being wired together wrong.
        let mut t = HostUsageTracker::new();
        t.ingest(vec![
            PeerReading { conn_key: "a".into(), app: "firefox".into(), ip: "8.8.8.8".into(), port: Some(53), rx: 10, tx: 0, pid: None },
            PeerReading { conn_key: "b".into(), app: "firefox".into(), ip: "192.168.1.5".into(), port: Some(53), rx: 5, tx: 0, pid: None },
        ]);
        // Past the baseline snapshot, so both peers carry bytes and so reach the
        // summary at all.
        t.ingest(vec![
            PeerReading { conn_key: "a".into(), app: "firefox".into(), ip: "8.8.8.8".into(), port: Some(53), rx: 20, tx: 0, pid: None },
            PeerReading { conn_key: "b".into(), app: "firefox".into(), ip: "192.168.1.5".into(), port: Some(53), rx: 15, tx: 0, pid: None },
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
            PeerReading { conn_key: "a".into(), app: "app".into(), ip: "192.168.1.5".into(), port: Some(53), rx: 10, tx: 0, pid: None },
            PeerReading { conn_key: "b".into(), app: "app".into(), ip: "140.82.113.25".into(), port: Some(443), rx: 10, tx: 0, pid: None },
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
                port: Some(48211), // ephemeral peer port — not a known service
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
