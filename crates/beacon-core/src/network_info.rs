use crate::shell::{first_int, first_match, try_run};
use crate::types::{ConnectionDetails, NetworkInfo};
use regex_lite::Regex;

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
        let re_sig = Regex::new(r"signal:\s*(-?\d+)").unwrap();
        let re_ssid = Regex::new(r"SSID:\s*(.+)").unwrap();
        let re_freq = Regex::new(r"freq:\s*(\d+)").unwrap();
        d.signal_dbm = d.signal_dbm.or(first_int(&out, &re_sig));
        if d.ssid.is_none() {
            d.ssid = first_match(&out, &re_ssid).map(|s| s.trim().to_string());
        }
        d.frequency = d.frequency.or(first_int(&out, &re_freq));
    }

    if let Some(out) = try_run(&format!("iw dev {iface} info 2>/dev/null")).await {
        let re_chan = Regex::new(r"channel\s+(\d+)").unwrap();
        let re_freq = Regex::new(r"channel\s+\d+\s+\((\d+)").unwrap();
        d.channel = d.channel.or(first_int(&out, &re_chan));
        d.frequency = d.frequency.or(first_int(&out, &re_freq));
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
        let re_speed = Regex::new(r"Speed:\s*(\d+)").unwrap();
        let re_duplex = Regex::new(r"Duplex:\s*(\w+)").unwrap();
        d.link_speed_mbps = first_int(&out, &re_speed);
        d.duplex = first_match(&out, &re_duplex);
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
    let re_ssid = Regex::new(r"SSID\s*:\s*(.+)").unwrap();
    let re_sig = Regex::new(r"Signal\s*:\s*(\d+)%").unwrap();
    let re_chan = Regex::new(r"Channel\s*:\s*(\d+)").unwrap();
    let re_auth = Regex::new(r"Authentication\s*:\s*(.+)").unwrap();
    finalize_wifi(ConnectionDetails {
        ssid: first_match(&out, &re_ssid).map(|s| s.trim().to_string()),
        signal_strength: first_int(&out, &re_sig),
        channel: first_int(&out, &re_chan),
        security: first_match(&out, &re_auth).map(|s| s.trim().to_string()),
        ..Default::default()
    })
}

pub async fn connection_details(iface: &str, connection_type: &str) -> ConnectionDetails {
    match (std::env::consts::OS, connection_type) {
        ("linux", "wifi") => linux_wifi_details(iface).await,
        ("linux", _) => linux_ethernet_details(iface).await,
        ("macos", "wifi") => mac_wifi_details().await,
        ("windows", "wifi") => windows_wifi_details().await,
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
