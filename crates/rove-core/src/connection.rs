//! This machine's own connection: the default route, DNS, the active link's
//! Wi-Fi or Ethernet details, its interfaces, and the "join this Wi-Fi" share.
pub mod wifi_share;

use crate::platform;
use crate::utils::shell::{trimmed_non_empty, try_run};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionDetails {
    pub ssid: Option<String>,
    pub signal_strength: Option<i64>,
    pub signal_dbm: Option<i64>,
    pub frequency: Option<i64>,
    pub channel: Option<i64>,
    pub security: Option<String>,
    pub wifi_standard: Option<String>,
    pub link_speed_mbps: Option<i64>,
    pub duplex: Option<String>,
    pub vendor: Option<String>,
    pub product: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkInfo {
    /// `"wifi"`, `"ethernet"` or `"disconnected"`.
    pub connection_type: String,
    pub is_connected: bool,
    pub interface_name: Option<String>,
    pub ip_address: Option<String>,
    pub gateway: Option<String>,
    pub mac_address: Option<String>,
    pub dns: Vec<String>,
    #[serde(flatten)]
    pub details: ConnectionDetails,
}

pub async fn default_gateway() -> Option<String> {
    if cfg!(target_os = "windows") {
        return platform::windows::default_gateway().await;
    }
    // On macOS a VPN tunnel can top the routing table with no gateway, so prefer
    // the physical default route's gateway, falling through when it has none.
    if cfg!(target_os = "macos") {
        if let Some((_, Some(gw))) = platform::macos::best_default_route().await {
            return Some(gw);
        }
    }
    // `!/linkdown/` drops the stale gateway of a just-unplugged NIC, so
    // diagnostics read Offline rather than a misleading NoInternet. Same filter
    // as `default_interface`.
    let ip_route = try_run("ip route show default 2>/dev/null | awk '!/linkdown/ {print $3; exit}'").await;
    if let Some(ip) = ip_route.as_deref().and_then(trimmed_non_empty) {
        return Some(ip);
    }
    let out = try_run("route -n get default 2>/dev/null | grep gateway | awk '{print $2}'").await?;
    trimmed_non_empty(&out)
}

/// The interface the kernel routes default traffic through, read from the
/// routing table.
pub async fn default_interface() -> Option<String> {
    if cfg!(target_os = "windows") {
        return platform::windows::default_interface().await;
    }
    // Skip VPN and virtual tunnels that can outrank the physical link (see
    // `best_default_route`); otherwise the whole app binds to an interface with
    // no IP, gateway or LAN subnet.
    if cfg!(target_os = "macos") {
        if let Some((iface, _)) = platform::macos::best_default_route().await {
            return Some(iface);
        }
    }
    // `!/linkdown/` skips a default route the kernel has flagged dead (an
    // unplugged NIC whose route the network manager hasn't torn down yet), so a
    // live higher-metric route wins over the stale one.
    let ip_route = try_run(
        "ip route show default 2>/dev/null | awk '!/linkdown/ {for (i = 1; i < NF; i++) if ($i == \"dev\") { print $(i + 1); exit }}'",
    )
    .await;
    if let Some(name) = ip_route.as_deref().and_then(trimmed_non_empty) {
        // A stale route isn't always flagged `linkdown` (that depends on the
        // network manager), so also confirm the hardware carrier. `carrier_up`
        // reads sysfs, hence Linux only.
        if !cfg!(target_os = "linux") || platform::linux::carrier_up(&name) {
            return Some(name);
        }
    }
    let out = try_run("route -n get default 2>/dev/null | grep interface | awk '{print $2}'").await?;
    trimmed_non_empty(&out)
}

/// The current network's identity, `interface|ip`, built like the UI's
/// `useNetworkKey`, so a cached result can be matched to the network it was
/// measured on. None while there's no default route.
pub async fn network_key() -> Option<String> {
    let interface = default_interface().await?;
    let (ip, _) = crate::interfaces::address_of(&interface).await;
    Some(format_network_key(&interface, ip.as_deref()))
}

/// `interface|ip`, with an empty IP when the interface has none, as the UI
/// writes it.
pub fn format_network_key(interface: &str, ip: Option<&str>) -> String {
    format!("{interface}|{}", ip.unwrap_or(""))
}

pub async fn dns_servers() -> Vec<String> {
    if cfg!(target_os = "windows") {
        return platform::windows::dns_servers().await;
    }
    // Linux and macOS both keep the active resolvers in resolv.conf.
    if let Some(out) = try_run("grep '^nameserver' /etc/resolv.conf 2>/dev/null | awk '{print $2}'").await {
        return out.lines().map(str::trim).filter(|l| !l.is_empty()).map(String::from).collect();
    }
    Vec::new()
}

/// Active connection details (SSID, signal, link speed, …) for `iface`. Each
/// arm delegates to the matching probe in [`crate::platform`].
pub async fn connection_details(iface: &str, connection_type: &str) -> ConnectionDetails {
    // Every platform probe below interpolates `iface` into a shell command;
    // refuse anything that isn't a well-formed interface name.
    if !crate::utils::net::is_shell_safe_iface(iface) {
        return ConnectionDetails::default();
    }
    match (std::env::consts::OS, connection_type) {
        ("linux", "wifi") => platform::linux::wifi_details(iface).await,
        ("linux", _) => platform::linux::ethernet_details(iface).await,
        ("macos", "wifi") => platform::macos::wifi_details(iface).await,
        ("macos", _) => platform::macos::ethernet_details(iface).await,
        ("windows", "wifi") => platform::windows::wifi_details().await,
        ("windows", _) => platform::windows::ethernet_details(iface).await,
        _ => ConnectionDetails::default(),
    }
}

/// `"wifi"` or `"ethernet"` from the interface name, with sysfs deciding on
/// Linux. Wrong on macOS, where Wi-Fi is `enN` too.
pub fn infer_connection_type(name: &str) -> &'static str {
    let lower = name.to_lowercase();
    if cfg!(target_os = "linux") && std::path::Path::new(&format!("/sys/class/net/{name}/wireless")).exists() {
        return "wifi";
    }
    if lower.starts_with("wl") || lower.contains("wi-fi") || lower.contains("wlan") || lower.contains("airport") {
        "wifi"
    } else {
        "ethernet"
    }
}

/// The public (WAN) IP as seen by an external echo service. Uses reqwest, not
/// `curl`, which a stock Windows or minimal Linux install lacks and which would
/// bypass our TLS config.
pub async fn public_ip() -> Option<String> {
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(5)).build().ok()?;
    let response = client.get("https://api.ipify.org").send().await.ok()?;
    // The parse below would reject an error page too, but that looks the same as
    // being offline. Log which it was.
    let status = response.status();
    if !status.is_success() {
        tracing::warn!("api.ipify.org public-IP lookup returned HTTP {status}");
        return None;
    }
    let ip = response.text().await.ok()?.trim().to_string();
    (!ip.is_empty() && ip.parse::<std::net::IpAddr>().is_ok()).then_some(ip)
}

pub async fn network_info() -> NetworkInfo {
    let (iface, gateway, dns) = tokio::join!(default_interface(), default_gateway(), dns_servers());

    let Some(iface) = iface else {
        return NetworkInfo {
            connection_type: "disconnected".into(),
            is_connected: false,
            interface_name: None,
            ip_address: None,
            gateway,
            mac_address: None,
            dns,
            details: ConnectionDetails::default(),
        };
    };

    let (ip, mac) = crate::interfaces::address_of(&iface).await;
    // macOS names Wi-Fi `enN`, which the name heuristic reads as Ethernet, so
    // ask the hardware-port map instead.
    let connection_type = if cfg!(target_os = "macos") {
        platform::macos::connection_type_for(&iface).await
    } else {
        infer_connection_type(&iface)
    };
    let mut details = connection_details(&iface, connection_type).await;

    // Linux fallback when neither ethtool nor iw supplied a rate; /sys doesn't
    // exist on the other platforms.
    if details.link_speed_mbps.is_none() && cfg!(target_os = "linux") {
        details.link_speed_mbps = platform::linux::sysfs_link_speed(&iface);
    }

    // Wi-Fi on Windows has no link speed from netsh; fall back to the adapter's
    // negotiated rate so the card, speed test and interface list agree.
    if details.link_speed_mbps.is_none() && cfg!(target_os = "windows") {
        details.link_speed_mbps = platform::windows::link_speed(&iface).await;
    }

    // Fall back to the MAC's OUI for the adapter vendor when the platform probe
    // didn't supply one (Windows Ethernet, macOS Wi-Fi).
    if details.vendor.is_none() {
        if let Some(mac) = &mac {
            details.vendor = crate::devices::oui::lookup_vendor(mac);
        }
    }

    NetworkInfo {
        connection_type: connection_type.into(),
        is_connected: true,
        interface_name: Some(iface),
        ip_address: ip,
        gateway,
        mac_address: mac,
        dns,
        details,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn network_key_matches_the_ui_format() {
        assert_eq!(format_network_key("wlan0", Some("192.168.1.20")), "wlan0|192.168.1.20");
        assert_eq!(format_network_key("wlan0", None), "wlan0|");
    }
}
