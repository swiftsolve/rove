//! macOS's per-socket source for [`crate::usage::app`] and [`crate::usage::host`]:
//! `nettop`, which lists each process's sockets beneath it with cumulative bytes,
//! TCP and UDP alike. Compiled into every test build, so the parsers are tested
//! on any OS.
#[cfg(target_os = "macos")]
use super::app::CounterSemantics;
use super::app::UsageUnit;
use super::host::PeerReading;
#[cfg(target_os = "macos")]
use super::Support;
use crate::util::net::{peer_port, routable_peer_ip};
use std::collections::HashMap;

#[cfg(target_os = "macos")]
pub(super) const SEMANTICS: CounterSemantics = CounterSemantics::Socket;

#[cfg(target_os = "macos")]
pub(super) fn support() -> Support {
    Support::Supported
}

#[cfg(target_os = "macos")]
pub(super) fn support_detail() -> Option<String> {
    None
}

/// No -P: its per-process row can't be accumulated (see `usage::app`'s docs).
/// No -m, so UDP is listed too. -L 1 one sample, -x raw bytes, -n no DNS, -J
/// only our columns.
#[cfg(target_os = "macos")]
pub(super) async fn sample_units() -> Option<Vec<UsageUnit>> {
    crate::util::shell::try_run("nettop -L 1 -x -n -J bytes_in,bytes_out").await.map(|out| parse_nettop_sockets(&out))
}

/// No -P, so each process row is followed by its connections. No -m, so UDP
/// is listed too and QUIC (HTTP/3 on :443) counts like TCP; unconnected UDP
/// (mDNS, DNS listeners) has a `*` peer and `routable_peer_ip` drops it. -x
/// raw bytes, -n no DNS (we resolve names ourselves).
#[cfg(target_os = "macos")]
pub(super) async fn sample_peers() -> Option<Vec<PeerReading>> {
    crate::util::shell::try_run("nettop -L 1 -x -n").await.map(|out| parse_nettop_peers(&out))
}

/// Parse `nettop -L 1 -x -n -J bytes_in,bytes_out` into per-socket readings. A
/// process row (`name.pid`) is followed by its socket rows (`tcp4
/// local<->peer`, `udp4 …`), each with cumulative counters. The process row is
/// only read as the owner, never banked: it's the sum of the rows under it, a
/// gauge over open sockets (see the module docs).
///
/// Listeners (empty byte columns) and sockets with a wildcard or loopback peer
/// are skipped, via [`crate::util::net::routable_peer_ip`], the same rule
/// [`crate::usage::host`] applies to the same sockets.
pub(super) fn parse_nettop_sockets(output: &str) -> Vec<UsageUnit> {
    let mut units: Vec<UsageUnit> = Vec::new();
    // (`name.pid`, name, pid) of the process whose rows we're reading.
    let mut current: Option<(String, String, Option<u32>)> = None;

    for line in output.lines() {
        // Split on ',' alone, keeping empty fields: a socket label contains
        // spaces, so splitting on whitespace would shift the byte columns.
        let mut fields = line.split(',');
        let Some(label) = fields.next().map(str::trim) else { continue };
        if label.is_empty() {
            continue;
        }

        if let Some((_, peer)) = label.split_once("<->") {
            let Some((owner, name, pid)) = &current else { continue };
            if crate::util::net::routable_peer_ip(peer).is_none() {
                continue;
            }
            let rx = fields.next().and_then(|f| f.trim().parse::<u64>().ok());
            let tx = fields.next().and_then(|f| f.trim().parse::<u64>().ok());
            let (Some(rx), Some(tx)) = (rx, tx) else { continue };
            units.push(UsageUnit {
                // Scope the socket to its owner: two processes can each hold a
                // socket printing the same label.
                key: format!("{owner}|{label}"),
                name: name.clone(),
                rx,
                tx,
                pid: *pid,
            });
            continue;
        }

        // A process row is "name.pid" with a numeric pid. Anything else (the
        // header) clears the owner so stray rows aren't misattributed.
        match label.rsplit_once('.') {
            Some((name, pid)) if !name.is_empty() && !pid.is_empty() && pid.bytes().all(|b| b.is_ascii_digit()) => {
                current = Some((label.to_string(), name.to_string(), pid.parse().ok()));
            }
            _ => current = None,
        }
    }

    // Defensive: a concrete peer makes each 4-tuple unique, so this shouldn't
    // fire. Rows sharing a key re-bank each other's whole counters every tick
    // (wildcard rows once read a music player at 1.4 GB in twelve seconds), so
    // dropping them under-counts, but boundedly.
    let mut seen: HashMap<String, usize> = HashMap::with_capacity(units.len());
    for unit in &units {
        *seen.entry(unit.key.clone()).or_default() += 1;
    }
    units.retain(|unit| seen.get(&unit.key) == Some(&1));
    units
}

/// Parse `nettop -L 1 -x -n`. A process row (`name.pid,,,bytes_in,bytes_out,…`)
/// owns the connection rows after it (`tcp4 local<->peer,iface,state,bytes_in,
/// bytes_out,…`, or `udp4 …`) until the next process row. Connections with no
/// routable peer (listeners, `*` wildcards, loopback) are skipped.
pub(super) fn parse_nettop_peers(output: &str) -> Vec<PeerReading> {
    let mut readings = Vec::new();
    let mut current: Option<(String, Option<u32>)> = None;

    for line in output.lines() {
        // Keep empty trailing fields so byte columns stay at fixed indices.
        let fields: Vec<&str> = line.split(',').collect();
        let Some(&label) = fields.get(1) else { continue };
        let label = label.trim();
        if label.is_empty() {
            continue;
        }

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

        // Otherwise a process row, "name.pid" with a numeric pid.
        if let Some((name, pid)) = label.rsplit_once('.') {
            if !name.is_empty() && !pid.is_empty() && pid.bytes().all(|b| b.is_ascii_digit()) {
                current = Some((name.to_string(), pid.parse::<u32>().ok()));
                continue;
            }
        }
        // Anything else (the header row) clears the owner so stray rows that
        // follow aren't misattributed.
        current = None;
    }
    readings
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_nettop_socket_rows_and_ignores_the_process_row() {
        // Real `nettop -L 1 -x -n -J bytes_in,bytes_out` shape: a header, then
        // each process followed by its sockets. The process row is exactly the
        // sum of its sockets, so banking it too would double-count. Listeners
        // print empty byte columns.
        let out = "\
,bytes_in,bytes_out,
launchd.1,0,0,
tcp4 127.0.0.1:8021<->*:*,,,
apsd.375,87292,449441,
tcp4 192.168.2.16:61151<->17.57.144.246:5223,87292,449441,
syslogd.368,0,422,
udp4 192.168.2.16:54845<->192.168.2.1:514,0,422,";
        let units = parse_nettop_sockets(out);
        assert_eq!(units.len(), 2, "one unit per socket carrying counters, none per process");
        assert_eq!(
            units[0],
            UsageUnit {
                key: "apsd.375|tcp4 192.168.2.16:61151<->17.57.144.246:5223".into(),
                name: "apsd".into(),
                rx: 87292,
                tx: 449441,
                pid: Some(375),
            }
        );
        // A connected UDP socket is metered exactly like TCP.
        assert_eq!(units[1].name, "syslogd");
        assert_eq!(units[1].tx, 422);
    }

    #[test]
    fn nettop_socket_rows_without_an_owning_process_are_dropped() {
        // The header row clears the owner, so a stray socket row can't be
        // misattributed to whichever process happened to be parsed last.
        let out = "\
,bytes_in,bytes_out,
tcp4 10.0.0.1:1<->10.0.0.2:2,500,500,";
        assert!(parse_nettop_sockets(out).is_empty());
    }

    /// Two processes can each hold a socket printing the same label, so the key
    /// has to be scoped to the owner or they'd collide into one unit.
    #[test]
    fn nettop_socket_keys_are_scoped_to_their_process() {
        let out = "\
,bytes_in,bytes_out,
firefox.1,10,0,
tcp4 10.0.0.1:1<->10.0.0.9:443,10,0,
Spotify.2,20,0,
tcp4 10.0.0.1:1<->10.0.0.9:443,20,0,";
        let units = parse_nettop_sockets(out);
        assert_eq!(units.len(), 2);
        assert_ne!(units[0].key, units[1].key);
    }

    /// The TIDAL regression: real nettop output where one process holds several
    /// unconnected sockets printing the identical label with different counters.
    /// Keyed together they telescope (each tick credits the largest counter
    /// afresh), which read a music player at 1.4 GB in twelve seconds. They must
    /// not be metered at all.
    #[test]
    fn nettop_wildcard_peer_sockets_are_not_metered() {
        let out = "\
,bytes_in,bytes_out,
TIDAL.44881,301974419,328,
udp4 *:5353<->*:*,19623541,40,
udp4 *:5353<->*:*,23292855,40,
udp4 *:5353<->*:*,51792185,40,
tcp4 192.168.2.16:5:1<->17.248.1.1:443,4096,128,";
        let units = parse_nettop_sockets(out);
        assert_eq!(units.len(), 1, "only the socket with a concrete peer is meterable");
        assert_eq!(units[0].rx, 4096);
    }

    /// Loopback is excluded on macOS just as on Linux and in the hosts view: a
    /// process talking to `127.0.0.1` isn't using the network. (The peer-rule
    /// unit tests live with the rule, in `util::net`; this pins that the parser
    /// actually applies it.)
    #[test]
    fn nettop_loopback_sockets_are_not_metered() {
        let out = "\
,bytes_in,bytes_out,
localproxy.7,5000,5000,
tcp4 127.0.0.1:9000<->127.0.0.1:53,4000,4000,
tcp4 192.168.2.16:51000<->17.248.1.1:443,1000,1000,";
        let units = parse_nettop_sockets(out);
        assert_eq!(units.len(), 1, "the loopback socket is dropped, the real one kept");
        assert_eq!(units[0].rx, 1000);
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

    /// QUIC (HTTP/3) is UDP to a real peer on :443, so it's attributed like TCP.
    /// Unconnected UDP (mDNS, `*` peer) and loopback UDP stay out.
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
}
