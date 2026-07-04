//! Small helpers shared across service modules.
use std::time::{SystemTime, UNIX_EPOCH};

const VIRTUAL_PREFIXES: [&str; 10] = [
    "veth", "docker", "br-", "virbr", "vnet", "tap", "tun", "wg", "zt", "vmnet",
];

/// Loopback / container / VPN interfaces that shouldn't count as hardware.
pub fn is_virtual_interface(name: &str) -> bool {
    name == "lo" || VIRTUAL_PREFIXES.iter().any(|p| name.starts_with(p))
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
    !s.is_empty()
        && s.len() <= 32
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-' | b'_' | b':' | b'@'))
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
