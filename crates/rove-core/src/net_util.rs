//! Small helpers shared across service modules.
use std::net::IpAddr;
use std::sync::{Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

/// The bare IP of a socket's peer, or `None` when that peer isn't a host out on
/// the network. Shared by the per-app and per-host trackers so the two agree on
/// what counts as traffic — they read the same sockets, and a rule that lived in
/// only one of them would silently drift.
///
/// `None` covers two different problems that happen to want the same answer:
///
///   * **A wildcard peer** (`*:*`, or `*.*` for v6) is an unconnected socket,
///     and it has no identity: `nettop` names a socket only by its address pair,
///     so one process can hold several printing the identical label with
///     different counters — nine `udp4 *:5353<->*:*` mDNS sockets, say — that
///     nothing distinguishes. Keyed together they re-bank each other every tick;
///     keyed apart they can't be. They are not meterable at all.
///   * **A loopback, unspecified or broadcast peer** never reaches the network.
///     Counting it would report a local dev server as bandwidth, and on Linux
///     both ends of a loopback connection are separate sockets, so an app talking
///     to itself would count every byte twice.
///
/// Private/LAN peers *are* routable here: a NAS on the same subnet is a real
/// host that real bytes crossed a real link to reach. It just has no country —
/// that's a separate question, see `host_usage::ip_is_public`.
pub(crate) fn routable_peer_ip(addr: &str) -> Option<String> {
    let a = addr.trim();
    if a.is_empty() || a.starts_with('*') {
        return None;
    }
    let ip = strip_port(a)?;
    match ip.parse::<IpAddr>() {
        Ok(parsed) if is_routable_peer(parsed) => Some(ip),
        _ => None,
    }
}

/// Strip the port from a peer token across the formats our sources emit:
/// `1.2.3.4:443` (both), `[2606::1]:443` (ss IPv6), `2606::1.443` (nettop IPv6).
pub(crate) fn strip_port(addr: &str) -> Option<String> {
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

/// Whether an address is a peer out on the network, rather than this machine
/// talking to itself or to nothing.
fn is_routable_peer(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => !v4.is_loopback() && !v4.is_unspecified() && !v4.is_broadcast(),
        IpAddr::V6(v6) => !v6.is_loopback() && !v6.is_unspecified(),
    }
}

/// Lock a mutex, recovering the guard on poison instead of panicking. A single
/// panic while holding one of these locks would otherwise wedge every caller
/// that touches the same state for the rest of the process's life.
pub fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Canonical MAC form: lowercase, colon-separated, zero-padded octets
/// ("8:3a:8d:AC:4:d0" → "08:3a:8d:ac:04:d0"). Accepts `:`- or `-`-separated
/// input (Windows uses dashes), so BSD's stripped octets match sysinfo/OUI
/// formatting and dedupe cleanly against the local machine's own address.
pub fn normalize_mac_colons(raw: &str) -> String {
    raw.split([':', '-'])
        .map(|octet| format!("{:0>2}", octet.to_ascii_lowercase()))
        .collect::<Vec<_>>()
        .join(":")
}

/// Bare MAC form: 12 lowercase hex chars, no separators ("AA:BB:CC:11:22:33" →
/// "aabbcc112233"). The DHCP cache keys on this so hits join the neighbor table
/// regardless of separator or case.
pub fn normalize_mac_bare(mac: &str) -> String {
    mac.chars()
        .filter(|c| c.is_ascii_hexdigit())
        .map(|c| c.to_ascii_lowercase())
        .collect()
}

const VIRTUAL_PREFIXES: [&str; 18] = [
    "veth", "docker", "br-", "virbr", "vnet", "tap", "tun", "wg", "zt", "vmnet",
    // macOS pseudo-interfaces: VPN tunnels (utunN — note "tun" above misses the
    // leading "u"), VM host networking (vmenetN, bridgeN), Apple Wireless Direct
    // Link / low-latency WLAN sidebands, and generic 4-in-6/6-in-4 tunnels.
    "utun", "vmenet", "bridge", "awdl", "llw", "gif",
    // Linux link-aggregation masters (`bond0`, `team0`). The master's counters
    // are the *sum* of its enslaved physical NICs, so counting both the master
    // and its slaves reports the traffic twice — the same double-count the Npcap
    // shim caused on Windows. The physical slaves carry the real bytes; drop the
    // master.
    "bond", "team",
];

/// Case-insensitive markers for Windows virtual/pseudo adapters that aren't real
/// hardware: Hyper-V switches, WFP/filter miniports, Wi-Fi Direct radios and
/// tunnelling pseudo-interfaces. A fallback for when the OS `Virtual` flag can't
/// be read; none of these substrings occur in a physical NIC's name.
const VIRTUAL_SUBSTRINGS: [&str; 10] = [
    "vethernet",
    "wi-fi direct",
    "wifi direct",
    "lightweight filter",
    "native mac layer",
    "kernel debug",
    "teredo",
    "pseudo-interface",
    "ip-https",
    // Npcap (Wireshark/Nmap, and bundled by some VPNs) installs a packet-capture
    // shim per physical NIC — e.g. "Ethernet-Npcap Packet Driver (NPCAP)-0000" —
    // that shadows the real adapter's byte counters exactly. Left in, the live
    // throughput sampler sums it alongside the real "Ethernet" and reports double
    // the actual rate. It never carries traffic of its own, so drop it.
    "npcap",
];

/// True for a bare kernel-bridge master (`br0`, `br1`, …). The Docker-style
/// `br-<hash>` form is already caught by the `br-` prefix; this covers the plain
/// numeric naming `iproute2` gives a hand-created bridge. Like a bond master, a
/// bridge's counters overlap its enslaved ports, so summing both double-counts.
fn is_numbered_bridge(name: &str) -> bool {
    name.strip_prefix("br")
        .is_some_and(|rest| !rest.is_empty() && rest.bytes().all(|b| b.is_ascii_digit()))
}

/// True for a Linux VLAN subinterface (`eth0.100`, `enp3s0.42`, `bond0.5`). The
/// tagged frames it counts have already crossed — and been counted on — its
/// parent, so the parent is always a superset: dropping the child removes the
/// duplication without hiding any traffic. No Windows or macOS interface name
/// contains a dot, so this is inert on those platforms.
fn is_vlan_subinterface(name: &str) -> bool {
    match name.rsplit_once('.') {
        Some((parent, tag)) => {
            !parent.is_empty() && !tag.is_empty() && tag.bytes().all(|b| b.is_ascii_digit())
        }
        None => false,
    }
}

/// Loopback / container / VPN interfaces that shouldn't count as hardware.
pub fn is_virtual_interface(name: &str) -> bool {
    if name == "lo" || VIRTUAL_PREFIXES.iter().any(|p| name.starts_with(p)) {
        return true;
    }
    if is_numbered_bridge(name) || is_vlan_subinterface(name) {
        return true;
    }
    let lower = name.to_ascii_lowercase();
    VIRTUAL_SUBSTRINGS.iter().any(|s| lower.contains(s))
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// True when `s` is a valid IP literal, and therefore safe to interpolate into
/// a shell command: a parsed address can only contain `[0-9a-fA-F:.]`, never a
/// shell metacharacter. Guards the `ping`/`getent`/`dscacheutil` call sites
/// that take an address straight from the neighbor table.
pub fn is_shell_safe_ip(s: &str) -> bool {
    s.parse::<std::net::IpAddr>().is_ok()
}

/// True when `s` is a plausible network-interface name: non-empty, short, and
/// limited to the characters the kernel actually uses. Rejects anything that
/// could carry shell metacharacters or break PowerShell quoting.
pub fn is_shell_safe_iface(s: &str) -> bool {
    // Windows interface names routinely contain spaces ("Ethernet 2", "Local
    // Area Connection"), so a space is permitted; every genuine shell
    // metacharacter (quotes, ;, |, &, $, backtick, …) stays rejected.
    !s.is_empty()
        && s.len() <= 40
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-' | b'_' | b':' | b'@' | b' '))
}

/// Wrap `s` in single quotes for safe interpolation into a `sh -c` command,
/// escaping any embedded single quote (`'` → `'\''`). Use for values we can't
/// constrain to a safe charset the way [`is_shell_safe_iface`] does — chiefly
/// SSIDs and NetworkManager profile names, which may contain spaces, quotes or
/// shell metacharacters. Not for Windows `cmd`, whose quoting rules differ.
pub fn shell_single_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// Strip control characters and bidi overrides from a display string sourced
/// from the network (mDNS TXT records, reverse DNS) before it is persisted or
/// rendered, and bound its length. Prevents a neighbor from injecting RTL
/// overrides or terminal control sequences into the device list.
pub fn sanitize_display(s: &str) -> String {
    s.chars()
        .filter(|c| !c.is_control() && !is_bidi_control(*c))
        .take(64)
        .collect::<String>()
        .trim()
        .to_string()
}

fn is_bidi_control(c: char) -> bool {
    matches!(c,
        '\u{200E}' | '\u{200F}'
        | '\u{202A}'..='\u{202E}'
        | '\u{2066}'..='\u{2069}')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_mac_colons_pads_and_lowercases() {
        // BSD `arp` zero-strips octets; Windows separates with dashes.
        assert_eq!(normalize_mac_colons("8:3a:8d:AC:4:d0"), "08:3a:8d:ac:04:d0");
        assert_eq!(normalize_mac_colons("10-A5-1D-01-8F-9C"), "10:a5:1d:01:8f:9c");
    }

    #[test]
    fn normalize_mac_bare_strips_separators_and_case() {
        assert_eq!(normalize_mac_bare("AA:BB:CC:11:22:33"), "aabbcc112233");
        assert_eq!(normalize_mac_bare("aa-bb-cc-11-22-33"), "aabbcc112233");
    }

    #[test]
    fn npcap_shadow_adapter_is_virtual_but_real_nic_is_not() {
        // The Npcap packet-capture shim mirrors the real NIC's counters, so it
        // must be excluded from the throughput sum; the physical adapter stays.
        assert!(is_virtual_interface("Ethernet-Npcap Packet Driver (NPCAP)-0000"));
        assert!(!is_virtual_interface("Ethernet"));
        assert!(!is_virtual_interface("Wi-Fi"));
    }

    #[test]
    fn linux_aggregation_and_vlan_netdevs_are_virtual() {
        // Bond/team masters and bridges mirror their members' counters; VLAN
        // subinterfaces re-count bytes already tallied on their parent. All would
        // double-count if summed, so each reads as virtual.
        assert!(is_virtual_interface("bond0"));
        assert!(is_virtual_interface("team0"));
        assert!(is_virtual_interface("br0"));
        assert!(is_virtual_interface("br1"));
        assert!(is_virtual_interface("eth0.100"));
        assert!(is_virtual_interface("enp3s0.42"));
        assert!(is_virtual_interface("bond0.5"));
    }

    #[test]
    fn real_nics_are_not_mistaken_for_aggregation_or_vlan() {
        // The physical leaves that actually carry the bytes must survive.
        assert!(!is_virtual_interface("eth0"));
        assert!(!is_virtual_interface("enp3s0"));
        assert!(!is_virtual_interface("wlan0"));
        assert!(!is_virtual_interface("wlp2s0"));
        assert!(!is_virtual_interface("en0"));
        // "br" not followed by only digits is a normal name, not a numbered bridge.
        assert!(!is_virtual_interface("brtest"));
    }

    #[test]
    fn strips_ports_across_formats() {
        assert_eq!(strip_port("1.2.3.4:443").as_deref(), Some("1.2.3.4"));
        assert_eq!(strip_port("[2606::1]:443").as_deref(), Some("2606::1"));
        assert_eq!(strip_port("2606:4700::1111.443").as_deref(), Some("2606:4700::1111"));
    }

    #[test]
    fn routable_peer_ip_rejects_what_isnt_a_host_on_the_network() {
        // Unconnected sockets: no peer, and no identity to meter them by.
        assert_eq!(routable_peer_ip("*:*"), None);
        assert_eq!(routable_peer_ip("*.*"), None);
        assert_eq!(routable_peer_ip(""), None);
        // Same machine: never touches the network, and on Linux would be counted
        // once at each end of the connection.
        assert_eq!(routable_peer_ip("127.0.0.1:80"), None);
        assert_eq!(routable_peer_ip("[::1]:80"), None);
        assert_eq!(routable_peer_ip("0.0.0.0:0"), None);
        // Real peers, public and private alike.
        assert_eq!(routable_peer_ip("17.248.1.1:443").as_deref(), Some("17.248.1.1"));
        assert_eq!(routable_peer_ip("192.168.2.1:53").as_deref(), Some("192.168.2.1"));
        assert_eq!(routable_peer_ip("2606:4700::1111.443").as_deref(), Some("2606:4700::1111"));
    }
}
