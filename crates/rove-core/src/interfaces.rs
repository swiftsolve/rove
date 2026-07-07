use crate::network_info::default_interface;
use crate::platform;
use crate::types::InterfaceSummary;

/// (ip4, mac) for one interface.
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
    // macOS (and any other non-Linux fallback): sysinfo names/MACs/IPs, with
    // oper-state and default-route enriched from `ifconfig` + the routing table.
    let (mut list, info, default, wifi_devices) = tokio::join!(
        async { platform::generic_interface_list() },
        platform::macos::interface_info(),
        default_interface(),
        platform::macos::wifi_devices(),
    );
    for iface in &mut list {
        if let Some(detail) = info.get(&iface.name) {
            if let Some(state) = &detail.oper_state {
                iface.oper_state = state.clone();
            }
            // ifconfig is more current than sysinfo for the IPv4 address; only
            // fall back to it, keeping sysinfo's value when both agree.
            if iface.ip_address.is_none() {
                iface.ip_address = detail.ipv4.clone();
            }
            // Ethernet link speed from the `media:` line. sysinfo reports none,
            // so this is the only source; Wi-Fi is filled from CoreWLAN below.
            iface.speed_mbps = detail.speed_mbps;
        }
        iface.is_default = default.as_deref() == Some(iface.name.as_str());
        // macOS names Wi-Fi `enN` like Ethernet, so the name heuristic in
        // `generic_interface_list` misreads it — correct it against the
        // authoritative hardware-port map (empty when `networksetup` is absent,
        // leaving the heuristic's guess in place).
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
