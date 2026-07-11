//! Privilege-free active discovery via TCP `connect()` probes.
//!
//! An ICMP sweep misses any host that drops ping — increasingly the default on
//! phones and locked-down IoT. A TCP connection attempt reaches those hosts:
//! the kernel must ARP-resolve the target to send the SYN, so the host lands in
//! the neighbor table whether it *accepts* (SYN-ACK) or *refuses* (RST) the
//! connection. Either outcome proves the host is alive. Ports that accept are
//! also a strong device-type hint (9100 → printer, 8009 → Chromecast, …), so
//! we return them for the classifier.
//!
//! This needs no raw sockets or elevated privileges, unlike ARP or SYN scanning.
use futures_util::StreamExt;
use std::collections::HashMap;
use std::net::{Ipv4Addr, SocketAddr};
use std::time::Duration;
use tokio::net::TcpStream;
use tokio::time::timeout;

/// Ports worth knocking on. Picked so at least one tends to be open on a live
/// host, and so an open port narrows down the device type. Keep this list short
/// — every entry multiplies the number of connections per host.
const PROBE_PORTS: &[u16] = &[
    80,    // http — routers, cameras, printers, most things with a web UI
    443,   // https
    22,    // ssh — computers, NAS, Raspberry Pi
    9100,  // raw JetDirect — printers
    631,   // ipp — printers
    554,   // rtsp — IP cameras, some TVs
    8009,  // chromecast
    8060,  // roku
    32400, // plex media server
    1400,  // sonos
    62078, // lockdownd — iPhone/iPad/iPod only
    445,   // smb — computers, NAS
    9999,  // smart-plug local control API (Kasa-style devices)
    6668,  // smart-plug local control API (Tuya-based devices)
];

/// Sockets in flight at once. Sized to finish a /24 within the discovery window
/// while staying well under a typical 1024 open-file limit.
const CONCURRENT_PROBES: usize = 400;
/// A live host on a LAN answers (accept or RST) in single-digit milliseconds;
/// this budget mostly bounds how long we wait on silent/absent addresses.
const CONNECT_TIMEOUT: Duration = Duration::from_millis(400);

/// Probe every usable host in `subnet` across [`PROBE_PORTS`]. Returns the set
/// of open ports keyed by host IP. Hosts that refuse every port still get woken
/// into the ARP table (the point of discovery) but won't appear in the map.
pub async fn probe(subnet: &str) -> HashMap<String, Vec<u16>> {
    let Some(hosts) = super::subnet::hosts(subnet) else {
        return HashMap::new();
    };
    // Materialize the (host, port) pairs so the stream has a plain owned source
    // and the resulting future stays `Send + 'static` for the Tauri command.
    let targets: Vec<(Ipv4Addr, u16)> = hosts
        .flat_map(|ip| PROBE_PORTS.iter().map(move |&port| (ip, port)))
        .collect();

    let open: Vec<(String, u16)> = futures_util::stream::iter(targets)
        .map(|(ip, port)| async move {
            let addr = SocketAddr::from((ip, port));
            // Only an accepted connection records an open port; a refusal or
            // timeout still did its discovery job by forcing ARP resolution.
            match timeout(CONNECT_TIMEOUT, TcpStream::connect(addr)).await {
                Ok(Ok(_stream)) => Some((ip.to_string(), port)),
                _ => None,
            }
        })
        .buffer_unordered(CONCURRENT_PROBES)
        .filter_map(|hit| async move { hit })
        .collect()
        .await;

    let mut by_ip: HashMap<String, Vec<u16>> = HashMap::new();
    for (ip, port) in open {
        by_ip.entry(ip).or_default().push(port);
    }
    for ports in by_ip.values_mut() {
        ports.sort_unstable();
    }
    by_ip
}
