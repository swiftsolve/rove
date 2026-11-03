//! Linux's per-socket source for [`crate::apps`] and [`crate::apps::hosts`]:
//! `ss -tinHp`, which reads each TCP socket's `TCP_INFO` byte counters with its
//! owning process. Unprivileged for your own sockets. Compiled into every test
//! build, so the parsers are tested on any OS.
use super::hosts::PeerReading;
#[cfg(target_os = "linux")]
use super::CounterSemantics;
#[cfg(target_os = "linux")]
use super::Support;
use super::UsageUnit;
use crate::utils::net::{peer_port, routable_peer_ip};

#[cfg(target_os = "linux")]
pub(super) const SEMANTICS: CounterSemantics = CounterSemantics::Socket;

#[cfg(target_os = "linux")]
pub(super) fn support() -> Support {
    Support::Supported
}

#[cfg(target_os = "linux")]
pub(super) fn support_detail() -> Option<String> {
    None
}

/// -t TCP only (UDP sockets have no byte counters in sock_diag), -i socket
/// info (the bytes), -n numeric, -H no header, -p process.
#[cfg(target_os = "linux")]
const SS: &str = "ss -tinHp";

#[cfg(target_os = "linux")]
pub(super) async fn sample_units() -> Option<Vec<UsageUnit>> {
    crate::utils::shell::try_run(SS).await.map(|out| parse_ss(&out))
}

#[cfg(target_os = "linux")]
pub(super) async fn sample_peers() -> Option<Vec<PeerReading>> {
    crate::utils::shell::try_run(SS).await.map(|out| parse_ss_peers(&out))
}

/// The number after `key` in a line, e.g. `5231` from `bytes_sent:5231`.
fn field_u64(line: &str, key: &str) -> Option<u64> {
    let start = line.find(key)? + key.len();
    let digits: String = line[start..].chars().take_while(|c| c.is_ascii_digit()).collect();
    digits.parse().ok()
}

/// The first process name from an `ss -p` process column, i.e. the `NAME` in
/// `users:(("NAME",pid=123,fd=45))`.
fn ss_proc_name(line: &str) -> Option<String> {
    let marker = "users:((\"";
    let start = line.find(marker)? + marker.len();
    let end = line[start..].find('"')?;
    Some(line[start..start + end].to_string())
}

/// The pid that goes with [`ss_proc_name`], i.e. the `123` in
/// `users:(("NAME",pid=123,fd=45))`.
fn ss_proc_pid(line: &str) -> Option<u32> {
    let marker = ",pid=";
    let start = line.find(marker)? + marker.len();
    let digits = line[start..].bytes().take_while(u8::is_ascii_digit).count();
    line[start..start + digits].parse().ok()
}

/// Parse `ss -tinHp` into per-socket readings. Each socket is a header line
/// (`STATE recvq sendq LOCAL PEER users:((...))`) then an indented info line
/// with `bytes_sent:`/`bytes_received:`. Sockets with no process (TIME-WAIT),
/// no counters, or no routable peer ([`crate::utils::net::routable_peer_ip`])
/// are skipped. Loopback matters most: the kernel lists both ends of a
/// `127.0.0.1` connection as sockets, so an app talking to itself would be
/// billed twice.
pub(super) fn parse_ss(output: &str) -> Vec<UsageUnit> {
    let mut units = Vec::new();
    // (name, socket key, pid) of the header awaiting its info line.
    let mut pending: Option<(String, String, Option<u32>)> = None;

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // The info line: `bytes_sent` is tx, `bytes_received` is rx.
        if trimmed.contains("bytes_sent:") || trimmed.contains("bytes_received:") {
            if let Some((name, key, pid)) = pending.take() {
                let tx = field_u64(trimmed, "bytes_sent:").unwrap_or(0);
                let rx = field_u64(trimmed, "bytes_received:").unwrap_or(0);
                units.push(UsageUnit { key, name, rx, tx, pid });
            }
            continue;
        }

        // A header line. A socket with no process resets the pairing so the
        // next info line isn't credited to a stale header.
        match ss_proc_name(trimmed) {
            Some(name) => {
                // Columns: STATE Recv-Q Send-Q Local Peer [Process].
                let mut cols = trimmed.split_whitespace();
                let local = cols.nth(3);
                let peer = cols.next();
                // A non-routable peer (loopback, listener) drops the pairing so
                // its info line isn't banked.
                pending = match (local, peer, peer.and_then(crate::utils::net::routable_peer_ip)) {
                    (Some(local), Some(peer), Some(_)) => Some((name, format!("{local}|{peer}"), ss_proc_pid(trimmed))),
                    _ => None,
                };
            }
            None => pending = None,
        }
    }
    units
}

/// Parse `ss -tinHp` into per-socket readings. Each socket is a header line
/// (`STATE recvq sendq LOCAL PEER users:((...))`) then an indented info line
/// with the byte counters. Sockets with no process, no byte line or no routable
/// peer (listeners, loopback) are dropped.
pub(super) fn parse_ss_peers(output: &str) -> Vec<PeerReading> {
    let mut readings = Vec::new();
    // (app, conn_key, peer_ip, peer_port, pid) awaiting its following info line.
    type Pending = (String, String, String, Option<u16>, Option<u32>);
    let mut pending: Option<Pending> = None;

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        if trimmed.contains("bytes_sent:") || trimmed.contains("bytes_received:") {
            if let Some((app, conn_key, ip, port, pid)) = pending.take() {
                let tx = field_u64(trimmed, "bytes_sent:").unwrap_or(0);
                let rx = field_u64(trimmed, "bytes_received:").unwrap_or(0);
                readings.push(PeerReading { conn_key, app, ip, port, rx, tx, pid });
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
                        Some((app, format!("{local}|{peer}"), ip, peer_port(peer), ss_proc_pid(trimmed)))
                    }
                    // No routable peer: reset the pairing so its info line
                    // isn't credited to the previous socket.
                    _ => None,
                }
            }
            None => None,
        };
    }
    readings
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ss_socket_rows() {
        // Two ESTAB sockets (firefox, spotify) plus a process-less TIME-WAIT
        // that must be ignored. Info lines are indented, as `ss -i` prints them.
        let out = "\
ESTAB 0 0 192.168.1.42:52134 140.82.113.25:443 users:((\"firefox\",pid=1234,fd=90))
\t cubic wscale:8,7 rto:212 rtt:11.5/5.75 mss:1418 cwnd:10 bytes_sent:5231 bytes_acked:5231 bytes_received:18422 segs_out:20 segs_in:22 send 9.8Mbps
ESTAB 0 0 192.168.1.42:40122 35.186.224.25:443 users:((\"spotify\",pid=567,fd=44))
\t cubic wscale:7,7 rto:204 bytes_sent:1200 bytes_received:900 segs_out:8 segs_in:9
TIME-WAIT 0 0 192.168.1.42:40120 35.186.224.25:443
\t cubic bytes_sent:99 bytes_received:99";
        let units = parse_ss(out);
        assert_eq!(units.len(), 2);
        assert_eq!(
            units[0],
            UsageUnit {
                key: "192.168.1.42:52134|140.82.113.25:443".into(),
                name: "firefox".into(),
                rx: 18422,
                tx: 5231,
                pid: Some(1234),
            }
        );
        assert_eq!(units[1].name, "spotify");
        assert_eq!(units[1].pid, Some(567));
        assert_eq!(units[1].rx, 900);
        assert_eq!(units[1].tx, 1200);
    }

    /// A loopback socket is dropped: on Linux the kernel lists both of its ends
    /// as separate sockets, so counting it bills an app talking to itself twice.
    #[test]
    fn ss_loopback_sockets_are_not_metered() {
        let out = "\
ESTAB 0 0 127.0.0.1:9000 127.0.0.1:53 users:((\"resolver\",pid=42,fd=7))
\t cubic bytes_sent:4000 bytes_received:4000 segs_out:3 segs_in:3
ESTAB 0 0 192.168.1.42:52134 140.82.113.25:443 users:((\"firefox\",pid=1234,fd=90))
\t cubic bytes_sent:100 bytes_received:200 segs_out:2 segs_in:2";
        let units = parse_ss(out);
        assert_eq!(units.len(), 1, "the loopback socket is dropped, the real one kept");
        assert_eq!(units[0].name, "firefox");
        assert_eq!(units[0].rx, 200);
    }

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
        assert_eq!(r[0].pid, Some(1234));
        // IPv6 peer in ss bracket form: IP kept without the port, port read off.
        assert_eq!(r[1].app, "spotify");
        assert_eq!(r[1].ip, "2606:4700::6810:85e5");
        assert_eq!(r[1].port, Some(443));
    }
}
