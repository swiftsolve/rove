//! Windows host/network probes: PowerShell (`Get-NetAdapter`, `Get-NetRoute`,
//! `Get-NetIPAddress`, `Get-DnsClientServerAddress`) and the Native Wi-Fi API.
/// Only Windows reads these, and the tests check them on every platform.
#[cfg(any(windows, test))]
mod beacon;
#[cfg(any(windows, test))]
mod wifi_codes;
#[cfg(windows)]
mod wlan;

use crate::connection::infer_connection_type;
use crate::connection::ConnectionDetails;
use crate::interfaces::InterfaceSummary;
use crate::utils::net::is_virtual_interface;
use crate::utils::shell::{trimmed_non_empty, try_run_powershell};
use std::net::Ipv4Addr;

/// The default route Windows forwards through, ranked so a VPN tunnel never
/// passes for the LAN uplink. (`Find-NetRoute` returns the tunnel; VPNs leave
/// the adapter's `0.0.0.0/0` in place beside their two `/1`s.) Ranked, as in
/// macOS's `pick_default_route`:
///
///  1. `Status -eq 'Up'`, past the stale default of an unplugged adapter.
///  2. `HardwareInterface` first, so a NIC beats any tunnel. A Hyper-V
///     vEthernet holding the only default still wins from tier two.
///  3. Lowest route + interface metric: Ethernet over Wi-Fi, as Windows does.
///
/// `field` is `InterfaceAlias` or `NextHop`, from the one ranking.
fn default_route_field(field: &str) -> String {
    /// Safe to splice: `field` is always one of the two literals passed below.
    const SCRIPT: &str = "\
        Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | ForEach-Object { \
          $r = $_; $a = Get-NetAdapter -InterfaceIndex $r.ifIndex -ErrorAction SilentlyContinue; \
          if ($a -and $a.Status -eq 'Up') { \
            $im = (Get-NetIPInterface -InterfaceIndex $r.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue).InterfaceMetric; \
            [pscustomobject]@{ InterfaceAlias = $r.InterfaceAlias; NextHop = $r.NextHop; \
              Metric = [int]$r.RouteMetric + [int]$im; Physical = [int]$a.HardwareInterface } } } | \
        Sort-Object @{Expression='Physical';Descending=$true}, @{Expression='Metric';Descending=$false} | \
        Select-Object -First 1 | ForEach-Object { $_.@FIELD@ }";
    SCRIPT.replace("@FIELD@", field)
}

/// The default gateway: the `NextHop` of the route [`default_interface`]
/// picks. See `default_route_field` for the ranking.
pub async fn default_gateway() -> Option<String> {
    let out = try_run_powershell(&default_route_field("NextHop")).await?;
    trimmed_non_empty(&out)
}

/// The interface Windows forwards through: a live physical NIC over a VPN
/// tunnel or a stale route on an unplugged adapter. See `default_route_field`.
pub async fn default_interface() -> Option<String> {
    let out = try_run_powershell(&default_route_field("InterfaceAlias")).await?;
    trimmed_non_empty(&out)
}

pub async fn dns_servers() -> Vec<String> {
    if let Some(out) =
        try_run_powershell("(Get-DnsClientServerAddress -AddressFamily IPv4).ServerAddresses | Select-Object -Unique")
            .await
    {
        return out.lines().map(str::trim).filter(|l| !l.is_empty()).map(String::from).collect();
    }
    Vec::new()
}

/// One PowerShell call listing every present adapter. `Virtual` is the OS's
/// own verdict on Hyper-V switches, tunnels and pseudo adapters; the IPv4 comes
/// from `Get-NetIPAddress`, skipping APIPA 169.254.*.
const WINDOWS_ADAPTERS: &str = "\
Get-NetAdapter | Where-Object { $_.Status -ne 'Not Present' } | ForEach-Object { \
$ip = (Get-NetIPAddress -InterfaceIndex $_.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '169.254.*' } | Select-Object -First 1).IPAddress; \
\"$($_.Name)|$($_.Status)|$($_.LinkSpeed)|$($_.MacAddress)|$([int]$_.Virtual)|$ip\" }";

pub async fn interface_list() -> Vec<InterfaceSummary> {
    let (out, default) = tokio::join!(try_run_powershell(WINDOWS_ADAPTERS), crate::connection::default_interface());
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
        let mac = parts
            .next()
            .and_then(|text| text.trim().parse::<crate::utils::mac::MacAddress>().ok())
            .map(|mac| mac.to_string());
        let is_virtual_flag = parts.next().map(str::trim) == Some("1");
        let ip = parts.next().map(str::trim).filter(|s| !s.is_empty()).map(String::from);

        // Filter and pseudo miniports (WFP, Npcap, …) report an all-zero MAC;
        // they aren't real interfaces.
        if mac.as_deref() == Some("00:00:00:00:00:00") {
            continue;
        }

        let is_virtual = is_virtual_flag || is_virtual_interface(name);
        let is_default = default.as_deref() == Some(name);
        // Physical NICs always show, even unplugged. Virtual adapters show only
        // with an IP or the default route, so a live Hyper-V switch or VPN
        // stays while idle WAN miniports, Bluetooth PAN and tunnels don't.
        if is_virtual && ip.is_none() && !is_default {
            continue;
        }

        let oper_state = if status.eq_ignore_ascii_case("up") { "up" } else { "down" };
        result.push(InterfaceSummary {
            connection_type: if is_virtual { "virtual".into() } else { infer_connection_type(name).into() },
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

/// The connected Wi-Fi network, from the Native Wi-Fi API (see [`wlan`]).
pub async fn wifi_details() -> ConnectionDetails {
    #[cfg(windows)]
    {
        let network = tokio::task::spawn_blocking(wlan::connected_network).await.ok().flatten();
        let Some(network) = network else {
            return ConnectionDetails::default();
        };
        let generation = wifi_codes::phy_generation(network.phy_type);
        let details = ConnectionDetails {
            ssid: network.ssid,
            signal_strength: Some(i64::from(network.signal_quality.min(100))),
            signal_dbm: network.rssi_dbm.map(i64::from),
            channel: network.channel.map(i64::from),
            frequency: network.centre_frequency_khz.map(|khz| i64::from(khz / 1000)),
            channel_width_mhz: generation
                .and_then(|generation| beacon::channel_width_mhz(&network.information_elements, generation)),
            security: Some(wifi_codes::security_label(network.is_security_enabled, network.auth_algorithm)),
            wifi_standard: wifi_codes::wifi_standard(network.phy_type).map(String::from),
            ..Default::default()
        };
        super::finalize_wifi(details)
    }
    #[cfg(not(windows))]
    ConnectionDetails::default()
}

/// The saved passphrase for `ssid`, from its Wi-Fi profile. Windows gives the
/// key in plain text only to an elevated administrator, so without admin this
/// returns `None`.
pub async fn wifi_password(ssid: &str) -> Option<String> {
    #[cfg(windows)]
    {
        let ssid = ssid.to_string();
        let xml = tokio::task::spawn_blocking(move || wlan::profile_xml(&ssid)).await.ok().flatten()?;
        wifi_codes::plain_text_key(&xml)
    }
    #[cfg(not(windows))]
    {
        let _ = ssid;
        None
    }
}

pub async fn ethernet_details(iface: &str) -> ConnectionDetails {
    // `connection_details` already validates `iface`, but this is pub.
    if !crate::utils::net::is_shell_safe_iface(iface) {
        return ConnectionDetails::default();
    }
    // One call, pipe-delimited: link speed ("2.5 Gbps"), duplex state (0
    // unknown, 1 half, 2 full) and the adapter description ("Realtek PCIe 2.5GbE
    // Family Controller"). Vendor comes from the MAC OUI instead, because the
    // driver provider is often just "Microsoft".
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

/// Negotiated link rate (Mbps) from `Get-NetAdapter`. Used for Wi-Fi too, so
/// the connection card and speed-test footer match the interface list.
pub async fn link_speed(iface: &str) -> Option<i64> {
    if !crate::utils::net::is_shell_safe_iface(iface) {
        return None;
    }
    let out = try_run_powershell(&format!("(Get-NetAdapter -Name '{iface}' -ErrorAction SilentlyContinue).LinkSpeed"))
        .await?;
    let line = out.lines().find(|l| !l.trim().is_empty())?;
    parse_link_speed(line).filter(|v| *v > 0)
}

/// `MediaDuplexState` (0 unknown, 1 half, 2 full, or the enum name) as the
/// lowercase token the UI expects.
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
        Some(crate::utils::round_to_i64(value * 1000.0))
    } else {
        Some(crate::utils::round_to_i64(value))
    }
}

/// The interface's IPv4 address and prefix length via `Get-NetIPAddress`.
/// `None` when the adapter has no usable IPv4.
///
/// sysinfo's `ip_networks()` intermittently reports no IPv4 on Windows, which
/// left the scan with no subnet. APIPA (169.254/16) is skipped so a
/// half-configured adapter doesn't scope the scan to its link-local range.
pub async fn subnet_of(interface: &str) -> Option<(Ipv4Addr, u32)> {
    if !crate::utils::net::is_shell_safe_iface(interface) {
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

/// The local timezone's offset from UTC in seconds right now, daylight saving
/// included, via PowerShell; `None` on any failure. (`BaseUtcOffset` would be
/// the standard offset, an hour off all summer.)
pub fn utc_offset_secs() -> Option<i64> {
    let mut cmd = std::process::Command::new("powershell");
    cmd.args(["-NoProfile", "-Command", "[TimeZoneInfo]::Local.GetUtcOffset([DateTime]::Now).TotalMinutes"]);
    super::hide_console(&mut cmd);
    cmd.output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| s.trim().parse::<f64>().ok())
        .map(|minutes| crate::utils::round_to_i64(minutes * 60.0))
}
