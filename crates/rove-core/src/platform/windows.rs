//! Windows host/network probes: PowerShell (`Get-NetAdapter`, `Find-NetRoute`,
//! `Get-NetIPAddress`, `Get-DnsClientServerAddress`) and `netsh wlan`.
use crate::net_util::is_virtual_interface;
use crate::network_info::infer_connection_type;
use crate::shell::{try_run, try_run_powershell};
use crate::types::{ConnectionDetails, InterfaceSummary};
use std::net::Ipv4Addr;

// ---- routing / DNS -------------------------------------------------------

/// Default gateway via a real forwarding lookup. `Get-NetRoute` lists every
/// 0.0.0.0/0 entry, including stale ones left on a just-disconnected adapter (an
/// unplugged Ethernet can keep a metric-0 default route), so sorting by metric
/// can pick a dead link. `Find-NetRoute` returns the route Windows would
/// actually use — only over a connected interface.
pub async fn default_gateway() -> Option<String> {
    let out = try_run_powershell("(Find-NetRoute -RemoteIPAddress '8.8.8.8' -ErrorAction SilentlyContinue | Where-Object NextHop | Select-Object -First 1).NextHop").await?;
    let ip = out.trim().to_string();
    if ip.is_empty() { None } else { Some(ip) }
}

/// Interface Windows actually forwards through — not the lowest-metric row,
/// which can be a stale route on a disconnected adapter (e.g. showing
/// "Ethernet 2" while on Wi-Fi). See [`default_gateway`].
pub async fn default_interface() -> Option<String> {
    let out = try_run_powershell("(Find-NetRoute -RemoteIPAddress '8.8.8.8' -ErrorAction SilentlyContinue | Select-Object -First 1).InterfaceAlias").await?;
    let name = out.trim().to_string();
    if name.is_empty() { None } else { Some(name) }
}

pub async fn dns_servers() -> Vec<String> {
    if let Some(out) = try_run_powershell(
        "(Get-DnsClientServerAddress -AddressFamily IPv4).ServerAddresses | Select-Object -Unique",
    )
    .await
    {
        return out.lines().map(str::trim).filter(|l| !l.is_empty()).map(String::from).collect();
    }
    Vec::new()
}

// ---- interface list ------------------------------------------------------

/// One PowerShell call listing every present adapter with the fields the UI
/// needs. `Virtual` is the OS's own verdict on Hyper-V switches, tunnels and
/// pseudo adapters; the per-adapter `Get-NetIPAddress` supplies the IPv4 (APIPA
/// 169.254.* excluded) that a down/virtual adapter may lack.
const WINDOWS_ADAPTERS: &str = "\
Get-NetAdapter | Where-Object { $_.Status -ne 'Not Present' } | ForEach-Object { \
$ip = (Get-NetIPAddress -InterfaceIndex $_.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '169.254.*' } | Select-Object -First 1).IPAddress; \
\"$($_.Name)|$($_.Status)|$($_.LinkSpeed)|$($_.MacAddress)|$([int]$_.Virtual)|$ip\" }";

pub async fn interface_list() -> Vec<InterfaceSummary> {
    let (out, default) = tokio::join!(
        try_run_powershell(WINDOWS_ADAPTERS),
        crate::network_info::default_interface()
    );
    let Some(out) = out else {
        return Vec::new();
    };

    let mut result = Vec::new();
    for line in out.lines() {
        // Name|Status|LinkSpeed|MacAddress|Virtual|IPv4
        let mut parts = line.splitn(6, '|');
        let name = parts.next().unwrap_or("").trim();
        let status = parts.next().unwrap_or("").trim();
        if name.is_empty() || status.is_empty() {
            continue; // phantom/disabled rows carry no status
        }
        let speed = parts.next().and_then(parse_link_speed).filter(|v| *v > 0);
        // "10-A5-1D-01-8F-9C" → "10:a5:1d:01:8f:9c"; `None` when empty.
        let mac = parts
            .next()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(crate::net_util::normalize_mac_colons);
        let is_virtual_flag = parts.next().map(str::trim) == Some("1");
        let ip = parts.next().map(str::trim).filter(|s| !s.is_empty()).map(String::from);

        // Filter/pseudo miniports (WFP, Npcap, …) report an all-zero MAC — they
        // aren't real interfaces, so drop them entirely.
        if mac.as_deref() == Some("00:00:00:00:00:00") {
            continue;
        }

        let is_virtual = is_virtual_flag || is_virtual_interface(name);
        let is_default = default.as_deref() == Some(name);
        // Physical NICs always show (even unplugged). Virtual/pseudo adapters
        // show only when actually in use — carrying an IP or serving as the
        // default route — so a live Hyper-V switch or VPN stays visible while
        // the pile of idle WAN miniports, Bluetooth PAN and tunnels stays out.
        if is_virtual && ip.is_none() && !is_default {
            continue;
        }

        let oper_state = if status.eq_ignore_ascii_case("up") { "up" } else { "down" };
        result.push(InterfaceSummary {
            connection_type: if is_virtual {
                "virtual".into()
            } else {
                infer_connection_type(name).into()
            },
            oper_state: oper_state.into(),
            ip_address: ip,
            mac_address: mac,
            speed_mbps: speed,
            is_default,
            is_virtual,
            name: name.to_string(),
        });
    }
    super::sort_interfaces(&mut result);
    result
}

// ---- connection details --------------------------------------------------

pub async fn wifi_details() -> ConnectionDetails {
    let Some(out) = try_run("netsh wlan show interfaces").await else {
        return ConnectionDetails::default();
    };
    parse_netsh_wifi(&out)
}

fn parse_netsh_wifi(out: &str) -> ConnectionDetails {
    let mut d = ConnectionDetails::default();
    let mut band_ghz: Option<f64> = None;
    // Match only the top-level "Key : Value" rows. Wi-Fi 6E/7 APs make netsh
    // print a "Colocated APs" block whose inline "Band:"/"Channel:" values come
    // *before* the real interface lines, so a naive first-match grabs a
    // colocated radio's channel (e.g. "Channel: 1") instead of the connected
    // one (e.g. "Channel : 101"). Keying off the whole-line label avoids that.
    for line in out.lines() {
        let Some((key, value)) = line.split_once(':') else { continue };
        let (key, value) = (key.trim(), value.trim());
        match key {
            "SSID" => d.ssid = non_empty(value),
            "Signal" => d.signal_strength = value.trim_end_matches('%').trim().parse().ok(),
            "Rssi" => d.signal_dbm = value.parse().ok(),
            "Channel" => d.channel = value.parse().ok(),
            "Band" => band_ghz = value.split_whitespace().next().and_then(|n| n.parse().ok()),
            "Authentication" => d.security = non_empty(value),
            "Radio type" => d.wifi_standard = non_empty(value),
            _ => {}
        }
    }

    // netsh reports band + channel but not the centre frequency, so derive it
    // from the standard channel plan. This lets the UI's frequency-based band
    // and channel formatters render exactly as they do on Linux/macOS.
    if let (Some(band), Some(channel)) = (band_ghz, d.channel) {
        d.frequency = channel_to_frequency(band, channel);
    }
    super::finalize_wifi(d)
}

fn non_empty(s: &str) -> Option<String> {
    Some(s.to_string()).filter(|s| !s.is_empty())
}

/// Centre frequency (MHz) for a Wi-Fi `channel` in the given band (GHz), per the
/// 802.11 channel plans. The band is required because channel numbers repeat
/// across bands (6 GHz channel 1 is not 2.4 GHz channel 1).
fn channel_to_frequency(band_ghz: f64, channel: i64) -> Option<i64> {
    use super::WifiBand;
    let band = if band_ghz >= 5.9 {
        WifiBand::Six
    } else if band_ghz >= 4.9 {
        WifiBand::Five
    } else if band_ghz >= 2.4 {
        WifiBand::TwoFour
    } else {
        return None;
    };
    Some(super::channel_to_frequency(band, channel))
}

pub async fn ethernet_details(iface: &str) -> ConnectionDetails {
    // One call for the three adapter fields, pipe-delimited: link speed
    // ("2.5 Gbps"), duplex state (0 unknown / 1 half / 2 full) and the adapter
    // description ("Realtek PCIe 2.5GbE Family Controller"). Vendor is filled
    // separately from the MAC OUI — the driver provider is often just "Microsoft".
    let out = try_run_powershell(&format!(
        "Get-NetAdapter -Name '{iface}' | ForEach-Object {{ \"$($_.LinkSpeed)|$($_.MediaDuplexState)|$($_.InterfaceDescription)\" }}"
    ))
    .await;

    let mut d = ConnectionDetails::default();
    if let Some(line) = out.as_deref().and_then(|s| s.lines().find(|l| !l.trim().is_empty())) {
        let mut parts = line.splitn(3, '|');
        d.link_speed_mbps = parts.next().and_then(parse_link_speed);
        d.duplex = parts.next().and_then(parse_duplex_state);
        d.product = parts.next().map(str::trim).filter(|s| !s.is_empty()).map(String::from);
    }
    d
}

/// Current negotiated link rate (Mbps) for a Windows adapter, from Get-NetAdapter.
/// Fills Wi-Fi's link speed, which `netsh` doesn't report as one figure — keeping
/// the connection card and speed-test footer consistent with the interface list.
pub async fn link_speed(iface: &str) -> Option<i64> {
    if !crate::net_util::is_shell_safe_iface(iface) {
        return None;
    }
    let out = try_run_powershell(&format!(
        "(Get-NetAdapter -Name '{iface}' -ErrorAction SilentlyContinue).LinkSpeed"
    ))
    .await?;
    let line = out.lines().find(|l| !l.trim().is_empty())?;
    parse_link_speed(line).filter(|v| *v > 0)
}

/// Windows `MediaDuplexState` (0 unknown / 1 half / 2 full) — accepting the enum
/// name too — into the lowercase token the UI's duplex formatter expects.
fn parse_duplex_state(raw: &str) -> Option<String> {
    match raw.trim() {
        "2" | "Full" => Some("full".to_string()),
        "1" | "Half" => Some("half".to_string()),
        _ => None,
    }
}

/// "2.5 Gbps" / "1 Gbps" / "100 Mbps" → Mbps.
pub(crate) fn parse_link_speed(text: &str) -> Option<i64> {
    let text = text.trim();
    let value: f64 = text.split_whitespace().next()?.parse().ok()?;
    if text.to_lowercase().contains("gbps") {
        Some((value * 1000.0) as i64)
    } else {
        Some(value as i64)
    }
}

// ---- subnet --------------------------------------------------------------

/// The interface's IPv4 address and prefix length via `Get-NetIPAddress`. `None`
/// when the adapter has no usable IPv4; the caller turns this into a CIDR.
///
/// `Get-NetIPAddress` is authoritative here — sysinfo's `ip_networks()` is
/// unreliable on Windows, intermittently reporting no IPv4 for the adapter,
/// which left the scan with a null subnet (empty "Subnet" subtitle). APIPA
/// (169.254/16) is skipped so a half-configured adapter doesn't scope the scan
/// to its link-local range instead of the real LAN.
pub async fn subnet_of(interface: &str) -> Option<(Ipv4Addr, u32)> {
    if !crate::net_util::is_shell_safe_iface(interface) {
        return None;
    }
    let out = try_run_powershell(&format!(
        "Get-NetIPAddress -InterfaceAlias '{interface}' -AddressFamily IPv4 | Where-Object {{ $_.IPAddress -notlike '169.254.*' }} | Select-Object -First 1 | ForEach-Object {{ \"$($_.IPAddress)/$($_.PrefixLength)\" }}"
    ))
    .await?;
    let (ip, prefix) = out.lines().next()?.trim().split_once('/')?;
    let ip: Ipv4Addr = ip.trim().parse().ok()?;
    let prefix: u32 = prefix.trim().parse().ok()?;
    Some((ip, prefix))
}

// ---- misc system probes --------------------------------------------------

/// Local timezone's offset from UTC in seconds, via PowerShell. `None` on any
/// failure so the caller can default to 0.
pub fn utc_offset_secs() -> Option<i64> {
    let mut cmd = std::process::Command::new("powershell");
    cmd.args(["-NoProfile", "-Command", "(Get-TimeZone).BaseUtcOffset.TotalMinutes"]);
    super::hide_console(&mut cmd);
    cmd.output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| s.trim().parse::<f64>().ok())
        .map(|minutes| (minutes * 60.0) as i64)
}

#[cfg(test)]
mod tests {
    use super::*;

    // A Wi-Fi 6E connection whose AP advertises colocated 2.4/5 GHz radios. The
    // colocated block lists "Channel: 1" and "Channel: 60" *before* the real
    // "Channel : 101" line — the parser must not be fooled into either.
    const NETSH_6E: &str = "\
    Name                   : Wi-Fi
    Description            : Intel(R) Wi-Fi 6E AX210 160MHz
    SSID                   : Bangla
    AP BSSID               : bc:d5:ed:f7:5c:c8
         Colocated APs:    : 2
            BSSID: bc:d5:ed:f7:5c:cb,  Band: 2.4 GHz,  Channel: 1
            BSSID: be:d5:ed:f7:5c:cd,  Band: 5 GHz,  Channel: 60
    Band                   : 6 GHz
    Channel                : 101
    Radio type             : 802.11ax
    Authentication         : WPA3-Personal  (H2E)
    Receive rate (Mbps)    : 2402
    Signal                 : 87%
    Rssi                   : -51
";

    #[test]
    fn parses_connected_radio_not_colocated_aps() {
        let d = parse_netsh_wifi(NETSH_6E);
        assert_eq!(d.ssid.as_deref(), Some("Bangla"));
        assert_eq!(d.channel, Some(101)); // not the colocated "Channel: 1"
        assert_eq!(d.signal_strength, Some(87));
        assert_eq!(d.signal_dbm, Some(-51));
        assert_eq!(d.wifi_standard.as_deref(), Some("802.11ax"));
        assert_eq!(d.security.as_deref(), Some("WPA3-Personal  (H2E)"));
        // 6 GHz channel 101 → 5950 + 101*5 = 6455 MHz, which the UI maps to "6 GHz".
        assert_eq!(d.frequency, Some(6455));
    }

    #[test]
    fn channel_frequency_bands_disambiguate_by_band() {
        assert_eq!(channel_to_frequency(2.4, 1), Some(2412));
        // 2.4 GHz channel 14 is the plan's outlier at 2484 MHz, not 2477.
        assert_eq!(channel_to_frequency(2.4, 14), Some(2484));
        assert_eq!(channel_to_frequency(5.0, 60), Some(5300));
        assert_eq!(channel_to_frequency(6.0, 101), Some(6455));
        assert_eq!(channel_to_frequency(0.0, 1), None);
    }
}
