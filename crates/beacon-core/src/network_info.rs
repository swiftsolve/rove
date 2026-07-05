use crate::shell::{first_int, first_match, try_run};
use crate::types::{ConnectionDetails, NetworkInfo};
use regex_lite::Regex;
use std::sync::LazyLock;

macro_rules! static_regex {
    ($name:ident, $pattern:literal) => {
        static $name: LazyLock<Regex> = LazyLock::new(|| Regex::new($pattern).unwrap());
    };
}

static_regex!(IW_SIGNAL, r"signal:\s*(-?\d+)");
static_regex!(IW_SSID, r"SSID:\s*(.+)");
static_regex!(IW_FREQ, r"freq:\s*(\d+)");
static_regex!(IW_TX_BITRATE, r"tx bitrate:\s*([\d.]+)\s*MBit/s");
static_regex!(IW_CHANNEL, r"channel\s+(\d+)");
static_regex!(IW_CHANNEL_FREQ, r"channel\s+\d+\s+\((\d+)");
static_regex!(ETHTOOL_SPEED, r"Speed:\s*(\d+)");
static_regex!(ETHTOOL_DUPLEX, r"Duplex:\s*(\w+)");
static_regex!(NETSH_SSID, r"SSID\s*:\s*(.+)");
static_regex!(NETSH_SIGNAL, r"Signal\s*:\s*(\d+)%");
static_regex!(NETSH_CHANNEL, r"Channel\s*:\s*(\d+)");
static_regex!(NETSH_AUTH, r"Authentication\s*:\s*(.+)");

pub async fn default_gateway() -> Option<String> {
    if cfg!(target_os = "windows") {
        let out = try_run("powershell -NoProfile -Command \"(Get-NetRoute -DestinationPrefix 0.0.0.0/0 | Sort-Object RouteMetric | Select-Object -First 1).NextHop\"").await?;
        let ip = out.trim().to_string();
        return if ip.is_empty() { None } else { Some(ip) };
    }
    if let Some(out) = try_run("ip route show default 2>/dev/null | awk '{print $3; exit}'").await {
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
        let out = try_run("powershell -NoProfile -Command \"(Get-NetRoute -DestinationPrefix 0.0.0.0/0 | Sort-Object RouteMetric | Select-Object -First 1).InterfaceAlias\"").await?;
        let name = out.trim().to_string();
        return if name.is_empty() { None } else { Some(name) };
    }
    if let Some(out) = try_run(
        "ip route show default 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == \"dev\") { print $(i + 1); exit }}'",
    )
    .await
    {
        let name = out.trim().to_string();
        if !name.is_empty() {
            return Some(name);
        }
    }
    let out = try_run("route -n get default 2>/dev/null | grep interface | awk '{print $2}'").await?;
    let name = out.trim().to_string();
    if name.is_empty() { None } else { Some(name) }
}

pub async fn dns_servers() -> Vec<String> {
    if cfg!(target_os = "windows") {
        if let Some(out) = try_run(
            "powershell -NoProfile -Command \"(Get-DnsClientServerAddress -AddressFamily IPv4).ServerAddresses | Select-Object -Unique\"",
        )
        .await
        {
            return out.lines().map(str::trim).filter(|l| !l.is_empty()).map(String::from).collect();
        }
        return Vec::new();
    }
    // Linux and macOS both keep the active resolvers in resolv.conf.
    if let Some(out) =
        try_run("grep '^nameserver' /etc/resolv.conf 2>/dev/null | awk '{print $2}'").await
    {
        return out.lines().map(str::trim).filter(|l| !l.is_empty()).map(String::from).collect();
    }
    Vec::new()
}

fn dbm_to_percent(dbm: i64) -> i64 {
    (2 * (dbm + 100)).clamp(0, 100)
}

fn finalize_wifi(mut d: ConnectionDetails) -> ConnectionDetails {
    if d.signal_strength.is_none() {
        if let Some(dbm) = d.signal_dbm {
            d.signal_strength = Some(dbm_to_percent(dbm));
        }
    }
    d
}

fn parse_nmcli_wifi_line(line: &str) -> ConnectionDetails {
    let parts: Vec<&str> = line.trim().split(':').collect();
    let mut d = ConnectionDetails::default();
    if parts.first() != Some(&"yes") {
        return d;
    }
    d.ssid = parts.get(1).filter(|s| !s.is_empty()).map(|s| s.to_string());
    d.signal_strength = parts.get(2).and_then(|s| s.parse().ok());
    d.frequency = parts.get(3).and_then(|s| s.parse().ok());
    d.channel = parts.get(4).and_then(|s| s.parse().ok());
    d.security = parts.get(5).filter(|s| !s.is_empty()).map(|s| s.to_string());
    d
}

async fn linux_wifi_details(iface: &str) -> ConnectionDetails {
    let mut d = ConnectionDetails::default();

    let nmcli = try_run(&format!(
        "nmcli -t -f ACTIVE,SSID,SIGNAL,FREQ,CHAN,SECURITY dev wifi list ifname {iface} 2>/dev/null | grep '^yes'"
    ))
    .await;
    if let Some(out) = nmcli {
        if let Some(line) = out.lines().next() {
            d = parse_nmcli_wifi_line(line);
        }
    }

    if let Some(out) = try_run(&format!("iw dev {iface} link 2>/dev/null")).await {
        d.signal_dbm = d.signal_dbm.or(first_int(&out, &IW_SIGNAL));
        if d.ssid.is_none() {
            d.ssid = first_match(&out, &IW_SSID).map(|s| s.trim().to_string());
        }
        d.frequency = d.frequency.or(first_int(&out, &IW_FREQ));
        if d.link_speed_mbps.is_none() {
            d.link_speed_mbps = first_match(&out, &IW_TX_BITRATE)
                .and_then(|s| s.parse::<f64>().ok())
                .map(|mbps| mbps.round() as i64)
                .filter(|v| *v > 0);
        }
    }

    if let Some(out) = try_run(&format!("iw dev {iface} info 2>/dev/null")).await {
        d.channel = d.channel.or(first_int(&out, &IW_CHANNEL));
        d.frequency = d.frequency.or(first_int(&out, &IW_CHANNEL_FREQ));
    }

    if d.ssid.is_none() {
        if let Some(out) = try_run(&format!("iwgetid {iface} -r 2>/dev/null")).await {
            let ssid = out.trim().to_string();
            if !ssid.is_empty() {
                d.ssid = Some(ssid);
            }
        }
    }

    finalize_wifi(d)
}

async fn linux_ethernet_details(iface: &str) -> ConnectionDetails {
    let mut d = ConnectionDetails::default();

    if let Some(out) = try_run(&format!("ethtool {iface} 2>/dev/null")).await {
        d.link_speed_mbps = first_int(&out, &ETHTOOL_SPEED);
        d.duplex = first_match(&out, &ETHTOOL_DUPLEX);
    }
    // /sys fallback when ethtool is missing
    if d.link_speed_mbps.is_none() {
        if let Ok(raw) = std::fs::read_to_string(format!("/sys/class/net/{iface}/speed")) {
            d.link_speed_mbps = raw.trim().parse().ok().filter(|v: &i64| *v > 0);
        }
    }

    if let Some(out) = try_run(&format!(
        "nmcli -t -f GENERAL.VENDOR,GENERAL.PRODUCT device show {iface} 2>/dev/null"
    ))
    .await
    {
        for line in out.lines() {
            if let Some(v) = line.strip_prefix("GENERAL.VENDOR:") {
                d.vendor = Some(v.trim().to_string()).filter(|s| !s.is_empty());
            }
            if let Some(v) = line.strip_prefix("GENERAL.PRODUCT:") {
                d.product = Some(v.trim().to_string()).filter(|s| !s.is_empty());
            }
        }
    }
    d
}

async fn mac_wifi_details() -> ConnectionDetails {
    let airport = "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport";
    let mut d = ConnectionDetails::default();
    if let Some(out) = try_run(&format!("{airport} -I")).await {
        for line in out.lines() {
            let mut parts = line.trim().splitn(2, ':');
            let key = parts.next().unwrap_or("").trim();
            let value = parts.next().unwrap_or("").trim();
            match key {
                "SSID" => d.ssid = Some(value.to_string()).filter(|s| !s.is_empty()),
                "agrCtlRSSI" => d.signal_dbm = value.parse().ok(),
                "channel" => d.channel = value.split(',').next().and_then(|v| v.trim().parse().ok()),
                _ => {}
            }
        }
    }
    finalize_wifi(d)
}

async fn windows_wifi_details() -> ConnectionDetails {
    let Some(out) = try_run("netsh wlan show interfaces").await else {
        return ConnectionDetails::default();
    };
    finalize_wifi(ConnectionDetails {
        ssid: first_match(&out, &NETSH_SSID).map(|s| s.trim().to_string()),
        signal_strength: first_int(&out, &NETSH_SIGNAL),
        channel: first_int(&out, &NETSH_CHANNEL),
        security: first_match(&out, &NETSH_AUTH).map(|s| s.trim().to_string()),
        ..Default::default()
    })
}

async fn windows_ethernet_details(iface: &str) -> ConnectionDetails {
    let out = try_run(&format!(
        "powershell -NoProfile -Command \"(Get-NetAdapter -Name '{iface}').LinkSpeed\""
    ))
    .await;
    ConnectionDetails {
        link_speed_mbps: out.as_deref().and_then(parse_link_speed),
        ..Default::default()
    }
}

/// "2.5 Gbps" / "1 Gbps" / "100 Mbps" → Mbps.
fn parse_link_speed(text: &str) -> Option<i64> {
    let text = text.trim();
    let value: f64 = text
        .split_whitespace()
        .next()?
        .parse()
        .ok()?;
    if text.to_lowercase().contains("gbps") {
        Some((value * 1000.0) as i64)
    } else {
        Some(value as i64)
    }
}

pub async fn connection_details(iface: &str, connection_type: &str) -> ConnectionDetails {
    // Every platform branch below interpolates `iface` into a shell command;
    // refuse anything that isn't a well-formed interface name.
    if !crate::net_util::is_shell_safe_iface(iface) {
        return ConnectionDetails::default();
    }
    match (std::env::consts::OS, connection_type) {
        ("linux", "wifi") => linux_wifi_details(iface).await,
        ("linux", _) => linux_ethernet_details(iface).await,
        ("macos", "wifi") => mac_wifi_details().await,
        ("windows", "wifi") => windows_wifi_details().await,
        ("windows", _) => windows_ethernet_details(iface).await,
        _ => ConnectionDetails::default(),
    }
}

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
    let connection_type = infer_connection_type(&iface);
    let mut details = connection_details(&iface, connection_type).await;

    if details.link_speed_mbps.is_none() {
        if let Ok(raw) = std::fs::read_to_string(format!("/sys/class/net/{iface}/speed")) {
            details.link_speed_mbps = raw.trim().parse().ok().filter(|v: &i64| *v > 0);
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
