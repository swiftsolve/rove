//! Every network interface on this machine, for the Interfaces view.
use crate::connection::default_interface;
use crate::platform;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InterfaceSummary {
    pub name: String,
    pub connection_type: String,
    pub oper_state: String,
    pub ip_address: Option<String>,
    pub mac_address: Option<String>,
    pub speed_mbps: Option<i64>,
    pub is_default: bool,
    pub is_virtual: bool,
}

/// `(ipv4, mac)` for one interface.
pub async fn address_of(name: &str) -> (Option<String>, Option<String>) {
    for iface in list().await {
        if iface.name == name {
            return (iface.ip_address, iface.mac_address);
        }
    }
    (None, None)
}

/// Cross-platform interface list. Each OS uses its most authoritative source:
/// Linux `ip -j addr`, Windows `Get-NetAdapter`, macOS sysinfo + `ifconfig`.
/// The per-OS builders live in [`crate::platform`].
pub async fn list() -> Vec<InterfaceSummary> {
    if cfg!(target_os = "linux") {
        return platform::linux::interface_list().await;
    }
    if cfg!(target_os = "windows") {
        return platform::windows::interface_list().await;
    }
    // macOS and any other OS: sysinfo for names, MACs and IPs, with oper-state
    // and the default flag from `ifconfig` and the routing table.
    let (mut list, ifconfig_info, default_iface, wifi_devices) = tokio::join!(
        async { platform::generic_interface_list() },
        platform::macos::interface_info(),
        default_interface(),
        platform::macos::wifi_devices(),
    );
    for iface in &mut list {
        if let Some(detail) = ifconfig_info.get(&iface.name) {
            if let Some(state) = &detail.oper_state {
                iface.oper_state = state.clone();
            }
            // sysinfo's IPv4 wins; `ifconfig` only fills a gap.
            if iface.ip_address.is_none() {
                iface.ip_address = detail.ipv4.clone();
            }
            // Ethernet speed from the `media:` line, the only source (sysinfo
            // has none). Wi-Fi is filled from CoreWLAN below.
            iface.speed_mbps = detail.speed_mbps;
        }
        iface.is_default = default_iface.as_deref() == Some(iface.name.as_str());
        // macOS names Wi-Fi `enN` like Ethernet, so the name heuristic in
        // `generic_interface_list` misreads it. Correct it from the hardware-port
        // map (empty without `networksetup`, which leaves the guess in place).
        if wifi_devices.iter().any(|d| d == &iface.name) {
            iface.connection_type = "wifi".into();
            // `ifconfig` reports Wi-Fi media as bare "autoselect" with no rate;
            // the negotiated transmit rate is only available in-process.
            if iface.speed_mbps.is_none() && iface.oper_state == "up" {
                iface.speed_mbps = platform::mac_native::wifi_tx_rate();
            }
        }
    }
    platform::sort_interfaces(&mut list);
    list
}
