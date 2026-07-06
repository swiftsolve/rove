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
    let (mut list, states, default) = tokio::join!(
        async { platform::generic_interface_list() },
        platform::macos::interface_states(),
        default_interface()
    );
    for iface in &mut list {
        if let Some(state) = states.get(&iface.name) {
            iface.oper_state = state.clone();
        }
        iface.is_default = default.as_deref() == Some(iface.name.as_str());
    }
    platform::sort_interfaces(&mut list);
    list
}
