use crate::platform;
use crate::shell::try_run;
use crate::types::{ConnectionDetails, NetworkInfo};

pub async fn default_gateway() -> Option<String> {
    if cfg!(target_os = "windows") {
        return platform::windows::default_gateway().await;
    }
    // On macOS a VPN tunnel can top the routing table with no gateway; prefer the
    // gateway of the physical default route. Fall through to the legacy probe if
    // that route has none.
    if cfg!(target_os = "macos") {
        if let Some((_, Some(gw))) = platform::macos::best_default_route().await {
            return Some(gw);
        }
    }
    // `!/linkdown/` keeps a stale gateway from a just-unplugged NIC out of the
    // result, so the diagnostics split reads Offline (no gateway) rather than a
    // misleading NoInternet — matching how `default_interface` filters the same
    // dead route.
    if let Some(out) =
        try_run("ip route show default 2>/dev/null | awk '!/linkdown/ {print $3; exit}'").await
    {
        let ip = out.trim().to_string();
        if !ip.is_empty() {
            return Some(ip);
        }
    }
    let out = try_run("route -n get default 2>/dev/null | grep gateway | awk '{print $2}'").await?;
    let ip = out.trim().to_string();
    if ip.is_empty() { None } else { Some(ip) }
}

/// Interface the kernel routes default traffic through — routing table first,
/// matching the Electron implementation.
pub async fn default_interface() -> Option<String> {
    if cfg!(target_os = "windows") {
        return platform::windows::default_interface().await;
    }
    // Skip VPN/virtual tunnels that can outrank the physical link (see
    // `best_default_route`); otherwise the whole app binds to an interface with
    // no IP, gateway or LAN subnet.
    if cfg!(target_os = "macos") {
        if let Some((iface, _)) = platform::macos::best_default_route().await {
            return Some(iface);
        }
    }
    // `!/linkdown/` skips a default route the kernel has flagged dead (an
    // unplugged NIC whose route the network manager hasn't torn down yet), so a
    // live higher-metric default route is chosen over a stale one when both exist.
    if let Some(out) = try_run(
        "ip route show default 2>/dev/null | awk '!/linkdown/ {for (i = 1; i < NF; i++) if ($i == \"dev\") { print $(i + 1); exit }}'",
    )
    .await
    {
        let name = out.trim().to_string();
        // Backstop the route-text check with the hardware carrier signal: a stale
        // default route isn't always `linkdown`-flagged (it depends on the network
        // manager), so confirm the chosen interface actually has link before
        // reporting it as connected. Non-Linux hosts never reach this `ip` path.
        if !name.is_empty() && (!cfg!(target_os = "linux") || platform::linux::carrier_up(&name)) {
            return Some(name);
        }
    }
    let out = try_run("route -n get default 2>/dev/null | grep interface | awk '{print $2}'").await?;
    let name = out.trim().to_string();
    if name.is_empty() { None } else { Some(name) }
}

pub async fn dns_servers() -> Vec<String> {
    if cfg!(target_os = "windows") {
        return platform::windows::dns_servers().await;
    }
    // Linux and macOS both keep the active resolvers in resolv.conf.
    if let Some(out) =
        try_run("grep '^nameserver' /etc/resolv.conf 2>/dev/null | awk '{print $2}'").await
    {
        return out.lines().map(str::trim).filter(|l| !l.is_empty()).map(String::from).collect();
    }
    Vec::new()
}

/// Active connection details (SSID, signal, link speed, …) for `iface`. Each
/// arm delegates to the matching probe in [`crate::platform`].
pub async fn connection_details(iface: &str, connection_type: &str) -> ConnectionDetails {
    // Every platform probe below interpolates `iface` into a shell command;
    // refuse anything that isn't a well-formed interface name.
    if !crate::net_util::is_shell_safe_iface(iface) {
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

pub fn infer_connection_type(name: &str) -> &'static str {
    let lower = name.to_lowercase();
    if cfg!(target_os = "linux")
        && std::path::Path::new(&format!("/sys/class/net/{name}/wireless")).exists()
    {
        return "wifi";
    }
    if lower.starts_with("wl") || lower.contains("wi-fi") || lower.contains("wlan") || lower.contains("airport") {
        "wifi"
    } else {
        "ethernet"
    }
}

/// The public (WAN) IP as seen by an external echo service. Uses the shared
/// reqwest stack rather than shelling out to `curl` (which isn't present on a
/// stock Windows or minimal Linux install and would bypass our TLS config).
pub async fn public_ip() -> Option<String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .ok()?;
    let ip = client
        .get("https://api.ipify.org")
        .send()
        .await
        .ok()?
        .text()
        .await
        .ok()?
        .trim()
        .to_string();
    (!ip.is_empty() && ip.parse::<std::net::IpAddr>().is_ok()).then_some(ip)
}

pub async fn network_info() -> NetworkInfo {
    let (iface, gateway, dns) =
        tokio::join!(default_interface(), default_gateway(), dns_servers());

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
    // macOS names Wi-Fi `enN`, so the name heuristic always misreads it as
    // Ethernet — resolve the medium through the hardware-port map instead.
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
            details.vendor = crate::oui::lookup_vendor(mac).map(String::from);
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
