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
