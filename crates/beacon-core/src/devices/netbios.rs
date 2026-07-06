//! NetBIOS name query (NBSTAT) — the best source of a *real* name for Windows
//! and SMB devices, which often have no mDNS record and only a router-assigned
//! reverse-DNS entry ("DESKTOP-3F9K2").
//!
//! A node-status request to UDP/137 returns the host's own name table; we read
//! the first unique name (the workstation/computer name). Pure Rust over a
//! `tokio` UDP socket — identical on Linux, macOS and Windows. We bind an
//! *ephemeral* local port and send *to* the target's :137, so there is no
//! conflict with the native NetBIOS/SMB services on Windows or macOS.
use futures_util::StreamExt;
use std::collections::HashMap;
use std::time::Duration;
use tokio::net::UdpSocket;

const NBNS_PORT: u16 = 137;
const CONCURRENT_QUERIES: usize = 128;
const QUERY_TIMEOUT: Duration = Duration::from_millis(600);

/// A node-status request for the wildcard name "*". The name is second-level
/// encoded: '*' (0x2A) → "CK", each of the 15 padding NULs → "AA", giving the
/// fixed 32-byte label below. Header is a standard NBNS query for type NBSTAT.
const NBSTAT_QUERY: &[u8] = &[
    0x00, 0x00, // transaction id
    0x00, 0x00, // flags: query
    0x00, 0x01, // questions: 1
    0x00, 0x00, // answer RRs
    0x00, 0x00, // authority RRs
    0x00, 0x00, // additional RRs
    0x20, // name length: 32
    b'C', b'K', b'A', b'A', b'A', b'A', b'A', b'A', b'A', b'A', b'A', b'A', b'A', b'A', b'A', b'A',
    b'A', b'A', b'A', b'A', b'A', b'A', b'A', b'A', b'A', b'A', b'A', b'A', b'A', b'A', //
    0x00, // name terminator
    0x00, 0x21, // type: NBSTAT
    0x00, 0x01, // class: IN
];

/// Query each host for its NetBIOS name, keyed by IP. Hosts that don't run
/// NetBIOS simply don't answer and are absent from the map.
pub async fn query_many(ips: &[String]) -> HashMap<String, String> {
    let results: Vec<(String, String)> = futures_util::stream::iter(ips.iter().cloned())
        .map(|ip| async move { query_one(&ip).await.map(|name| (ip, name)) })
        .buffer_unordered(CONCURRENT_QUERIES)
        .filter_map(|hit| async move { hit })
        .collect()
        .await;

    results.into_iter().collect()
}

async fn query_one(ip: &str) -> Option<String> {
    let addr: std::net::Ipv4Addr = ip.parse().ok()?;
    let socket = UdpSocket::bind((std::net::Ipv4Addr::UNSPECIFIED, 0)).await.ok()?;
    socket.send_to(NBSTAT_QUERY, (addr, NBNS_PORT)).await.ok()?;

    let mut buf = vec![0u8; 1024];
    let n = tokio::time::timeout(QUERY_TIMEOUT, socket.recv(&mut buf)).await.ok()?.ok()?;
    parse_node_status(&buf[..n])
}

/// Pull the first unique (non-group) name out of a node-status response.
fn parse_node_status(pkt: &[u8]) -> Option<String> {
    // Header is 12 bytes; the answer's NAME echoes the encoded question — walk
    // its length-prefixed labels to the 0x00 root, then skip the fixed RR
    // header (type 2 + class 2 + ttl 4 + rdlength 2) to reach the name table.
    let mut pos = 12;
    while *pkt.get(pos)? != 0 {
        pos += 1 + *pkt.get(pos)? as usize;
    }
    pos += 1; // root label
    pos += 2 + 2 + 4 + 2; // type, class, ttl, rdlength
    let count = *pkt.get(pos)? as usize;
    pos += 1;

    // Each entry: 15-byte name + 1-byte suffix + 2-byte flags. The high bit of
    // the flags marks a group name; the first *unique* name is the host's own.
    for _ in 0..count {
        let name = pkt.get(pos..pos + 15)?;
        let flags = u16::from_be_bytes([*pkt.get(pos + 16)?, *pkt.get(pos + 17)?]);
        pos += 18;

        let is_group = flags & 0x8000 != 0;
        if is_group {
            continue;
        }
        let text = String::from_utf8_lossy(name);
        let trimmed = text.trim_end_matches([' ', '\0']).trim();
        if !trimmed.is_empty() {
            let name = crate::net_util::sanitize_display(trimmed);
            if !name.is_empty() {
                return Some(name);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a minimal node-status response with the given (name, is_group)
    /// entries, so parsing can be tested without a live host.
    fn response(entries: &[(&str, bool)]) -> Vec<u8> {
        let mut pkt = vec![0u8; 12]; // header (contents don't matter for parsing)
        // Answer NAME: length-prefixed "*" label (0x20 + 32 bytes) + root.
        pkt.push(0x20);
        pkt.extend_from_slice(&[b'A'; 32]);
        pkt.push(0x00);
        pkt.extend_from_slice(&[0x00, 0x21]); // type
        pkt.extend_from_slice(&[0x00, 0x01]); // class
        pkt.extend_from_slice(&[0x00, 0x00, 0x00, 0x00]); // ttl
        pkt.extend_from_slice(&[0x00, 0x00]); // rdlength (unused by parser)
        pkt.push(entries.len() as u8);
        for (name, is_group) in entries {
            let mut field = format!("{name:<15}").into_bytes();
            field.truncate(15);
            pkt.extend_from_slice(&field);
            pkt.push(0x00); // suffix
            let flags: u16 = if *is_group { 0x8000 } else { 0x0000 };
            pkt.extend_from_slice(&flags.to_be_bytes());
        }
        pkt
    }

    #[test]
    fn reads_the_first_unique_name() {
        let pkt = response(&[("WORKGROUP", true), ("LIVINGROOM-PC", false)]);
        assert_eq!(parse_node_status(&pkt).as_deref(), Some("LIVINGROOM-PC"));
    }

    #[test]
    fn skips_group_names() {
        // Only a group (workgroup) name present → no usable host name.
        let pkt = response(&[("WORKGROUP", true)]);
        assert!(parse_node_status(&pkt).is_none());
    }

    #[test]
    fn truncated_packet_does_not_panic() {
        assert!(parse_node_status(&[0x00; 8]).is_none());
        assert!(parse_node_status(&[]).is_none());
    }
}
