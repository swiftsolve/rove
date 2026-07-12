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
use std::collections::{HashMap, HashSet};
use std::io::ErrorKind;
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

/// The outcome of probing a subnet: which ports are open, and which hosts
/// answered at the TCP layer at all.
pub struct ProbeResult {
    /// Open TCP ports keyed by host IP — connections that were accepted.
    pub open_ports: HashMap<String, Vec<u16>>,
    /// Hosts that answered *any* probe this scan, whether by accepting
    /// (SYN-ACK) or refusing (RST). Both prove the host is alive right now —
    /// including a phone asleep in Wi-Fi power-save, which drops ICMP and
    /// announces nothing yet still RSTs a SYN to a closed port. The scan feeds
    /// this into its liveness verdict so such a phone doesn't read "Offline".
    pub responsive: HashSet<String>,
}

/// Probe every usable host in `subnet` across [`PROBE_PORTS`]. Returns the open
/// ports per host and the set of hosts that answered at the TCP layer. Hosts
/// that neither accept nor refuse (silent/absent) still got woken into the ARP
/// table (the point of discovery) but appear in neither collection.
pub async fn probe(subnet: &str) -> ProbeResult {
    let Some(hosts) = super::subnet::hosts(subnet) else {
        return ProbeResult { open_ports: HashMap::new(), responsive: HashSet::new() };
    };
    // Materialize the (host, port) pairs so the stream has a plain owned source
    // and the resulting future stays `Send + 'static` for the Tauri command.
    let targets: Vec<(Ipv4Addr, u16)> = hosts
        .flat_map(|ip| PROBE_PORTS.iter().map(move |&port| (ip, port)))
        .collect();

    // Each answered probe yields the host IP and, when the connection was
    // accepted, the open port. `None` for the port means the host refused (RST)
    // — still a proof of life. A timeout or unreachable error yields nothing.
    let answers: Vec<(String, Option<u16>)> = futures_util::stream::iter(targets)
        .map(|(ip, port)| async move {
            let addr = SocketAddr::from((ip, port));
            match timeout(CONNECT_TIMEOUT, TcpStream::connect(addr)).await {
                // Accepted — the host is alive and this port is open.
                Ok(Ok(_stream)) => Some((ip.to_string(), Some(port))),
                // Refused (RST) — the port is closed, but the host answered, so
                // it's alive. This is what catches a power-saving phone that
                // ignores ICMP: it still RSTs a SYN to a closed port.
                Ok(Err(e)) if e.kind() == ErrorKind::ConnectionRefused => {
                    Some((ip.to_string(), None))
                }
                // No answer (timeout) or unreachable — nothing proven.
                _ => None,
            }
        })
        .buffer_unordered(CONCURRENT_PROBES)
        .filter_map(|hit| async move { hit })
        .collect()
        .await;

    let mut open_ports: HashMap<String, Vec<u16>> = HashMap::new();
    let mut responsive: HashSet<String> = HashSet::new();
    for (ip, port) in answers {
        if let Some(port) = port {
            open_ports.entry(ip.clone()).or_default().push(port);
        }
        responsive.insert(ip);
    }
    for ports in open_ports.values_mut() {
        ports.sort_unstable();
    }
    ProbeResult { open_ports, responsive }
}
