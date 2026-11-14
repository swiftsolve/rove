//! Privilege-free active discovery via TCP `connect()` probes.
//!
//! An ICMP sweep misses hosts that drop ping, increasingly the default on
//! phones and locked-down IoT. A TCP connect reaches them: the kernel must
//! ARP-resolve the target to send the SYN, so the host lands in the neighbor
//! table whether it accepts (SYN-ACK) or refuses (RST). Either proves it's
//! alive. Accepting ports are also a strong type hint (9100 printer, 8009
//! Chromecast), so they go to the classifier.
//!
//! This needs no raw sockets or elevated privileges, unlike ARP or SYN scanning.
use futures_util::StreamExt;
use std::collections::{HashMap, HashSet};
use std::io::ErrorKind;
use std::net::{Ipv4Addr, SocketAddr};
use std::time::Duration;
use tokio::net::TcpStream;
use tokio::time::timeout;

/// Ports worth knocking on: at least one tends to be open on a live host, and an
/// open one narrows the device type. Keep it short; every entry multiplies the
/// connections per host.
const PROBE_PORTS: &[u16] = &[
    80,    // http: routers, cameras, printers, most things with a web UI
    443,   // https
    22,    // ssh: computers, NAS, Raspberry Pi
    9100,  // raw JetDirect: printers
    631,   // ipp: printers
    554,   // rtsp: IP cameras, some TVs
    8009,  // chromecast
    8060,  // roku
    32400, // plex media server
    1400,  // sonos
    62078, // lockdownd: iPhone, iPad, iPod only
    445,   // smb: computers, NAS
    9999,  // smart-plug local control API (Kasa-style devices)
    6668,  // smart-plug local control API (Tuya-based devices)
];

/// Sockets in flight at once. Sized to finish a /24 within the discovery window
/// while staying well under a typical 1024 open-file limit.
const CONCURRENT_PROBES: usize = 400;
/// A live LAN host answers (accept or RST) in single-digit milliseconds; this
/// mostly bounds the wait on silent or absent addresses.
const CONNECT_TIMEOUT: Duration = Duration::from_millis(400);

pub struct ProbeResult {
    /// Accepted TCP ports keyed by host IP.
    pub open_ports: HashMap<Ipv4Addr, Vec<u16>>,
    /// Hosts that answered any probe this scan, by accepting or refusing. Both
    /// prove the host is alive now, including a phone in Wi-Fi power-save that
    /// drops ICMP and announces nothing yet still RSTs a SYN to a closed port.
    /// It feeds the liveness verdict so such a phone doesn't read Offline.
    pub responsive: HashSet<Ipv4Addr>,
}

/// Probe every usable host in `subnet` across [`PROBE_PORTS`]. Silent hosts
/// appear in neither collection but were still woken into the ARP table, which
/// is the point.
pub async fn probe(subnet: &str) -> ProbeResult {
    let Some(hosts) = super::subnet::hosts(subnet) else {
        return ProbeResult { open_ports: HashMap::new(), responsive: HashSet::new() };
    };
    // Materialize the (host, port) pairs so the stream has a plain owned source
    // and the resulting future stays `Send + 'static` for the Tauri command.
    let targets: Vec<(Ipv4Addr, u16)> = hosts.flat_map(|ip| PROBE_PORTS.iter().map(move |&port| (ip, port))).collect();

    let answers: Vec<(Ipv4Addr, Option<u16>)> = futures_util::stream::iter(targets)
        .map(|(ip, port)| async move {
            let addr = SocketAddr::from((ip, port));
            match timeout(CONNECT_TIMEOUT, TcpStream::connect(addr)).await {
                Ok(Ok(_stream)) => Some((ip, Some(port))),
                // Refused (RST): the port is closed but the host is alive. This
                // catches a power-saving phone that ignores ICMP.
                Ok(Err(e)) if e.kind() == ErrorKind::ConnectionRefused => Some((ip, None)),
                // Timeout or unreachable proves nothing.
                _ => None,
            }
        })
        .buffer_unordered(CONCURRENT_PROBES)
        .filter_map(|hit| async move { hit })
        .collect()
        .await;

    let mut open_ports: HashMap<Ipv4Addr, Vec<u16>> = HashMap::new();
    let mut responsive: HashSet<Ipv4Addr> = HashSet::new();
    for (ip, port) in answers {
        if let Some(port) = port {
            open_ports.entry(ip).or_default().push(port);
        }
        responsive.insert(ip);
    }
    for ports in open_ports.values_mut() {
        ports.sort_unstable();
    }
    ProbeResult { open_ports, responsive }
}
