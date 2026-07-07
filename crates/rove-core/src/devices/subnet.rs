//! IPv4 subnet arithmetic for scoping the scan.
use crate::platform;
use std::net::{IpAddr, Ipv4Addr};

/// CIDR of the interface's IPv4 network, e.g. "192.168.2.0/24". Each OS's
/// authoritative probe lives in [`crate::platform`]; sysinfo is the fallback.
pub async fn subnet_of(interface: &str) -> Option<String> {
    if cfg!(target_os = "linux") {
        if let Some((ip, prefix)) = platform::linux::subnet_of(interface).await {
            return Some(to_cidr(ip, prefix));
        }
    }
    if cfg!(target_os = "windows") {
        if let Some((ip, prefix)) = platform::windows::subnet_of(interface).await {
            return Some(to_cidr(ip, prefix));
        }
    }
    // Fallback everywhere: sysinfo reports each interface's IP networks with prefixes.
    let networks = sysinfo::Networks::new_with_refreshed_list();
    let data = networks.iter().find(|(name, _)| *name == interface)?.1;
    let ip_network = data.ip_networks().iter().find(|n| n.addr.is_ipv4())?;
    let IpAddr::V4(ip) = ip_network.addr else {
        return None;
    };
    Some(to_cidr(ip, u32::from(ip_network.prefix)))
}

/// Mask `ip` down to its network address and render as "network/prefix".
fn to_cidr(ip: Ipv4Addr, prefix: u32) -> String {
    let network = Ipv4Addr::from(u32::from(ip) & prefix_mask(prefix));
    format!("{network}/{prefix}")
}

/// Whether `ip` belongs to `subnet` ("a.b.c.d/p"). Unparseable input is
/// treated as in-scope — better to show too much than hide devices.
pub fn contains(subnet: &str, ip: &str) -> bool {
    let Some((network, prefix)) = parse(subnet) else {
        return true;
    };
    let Ok(ip) = ip.parse::<Ipv4Addr>() else {
        return true;
    };
    let mask = prefix_mask(prefix);
    (u32::from(ip) & mask) == (u32::from(network) & mask)
}

pub fn parse(subnet: &str) -> Option<(Ipv4Addr, u32)> {
    let (network, prefix) = subnet.split_once('/')?;
    Some((network.parse().ok()?, prefix.parse().ok()?))
}

pub fn prefix_mask(prefix: u32) -> u32 {
    if prefix == 0 {
        0
    } else {
        u32::MAX << (32 - prefix.min(32))
    }
}

pub fn ip_sort_key(ip: &str) -> u32 {
    ip.parse::<Ipv4Addr>().map(u32::from).unwrap_or(u32::MAX)
}
