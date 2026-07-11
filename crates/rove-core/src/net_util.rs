//! Small helpers shared across service modules.
use std::sync::{Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

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
}
