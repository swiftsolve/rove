//! Small helpers shared across service modules.
use std::time::{SystemTime, UNIX_EPOCH};

const VIRTUAL_PREFIXES: [&str; 16] = [
    "veth", "docker", "br-", "virbr", "vnet", "tap", "tun", "wg", "zt", "vmnet",
    // macOS pseudo-interfaces: VPN tunnels (utunN — note "tun" above misses the
    // leading "u"), VM host networking (vmenetN, bridgeN), Apple Wireless Direct
    // Link / low-latency WLAN sidebands, and generic 4-in-6/6-in-4 tunnels.
    "utun", "vmenet", "bridge", "awdl", "llw", "gif",
];

/// Case-insensitive markers for Windows virtual/pseudo adapters that aren't real
/// hardware: Hyper-V switches, WFP/filter miniports, Wi-Fi Direct radios and
/// tunnelling pseudo-interfaces. A fallback for when the OS `Virtual` flag can't
/// be read; none of these substrings occur in a physical NIC's name.
const VIRTUAL_SUBSTRINGS: [&str; 9] = [
    "vethernet",
    "wi-fi direct",
    "wifi direct",
    "lightweight filter",
    "native mac layer",
    "kernel debug",
    "teredo",
    "pseudo-interface",
    "ip-https",
];

/// Loopback / container / VPN interfaces that shouldn't count as hardware.
pub fn is_virtual_interface(name: &str) -> bool {
    if name == "lo" || VIRTUAL_PREFIXES.iter().any(|p| name.starts_with(p)) {
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
