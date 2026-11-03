//! Windows host/network probes: PowerShell (`Get-NetAdapter`, `Get-NetRoute`,
//! `Get-NetIPAddress`, `Get-DnsClientServerAddress`) and `netsh wlan`.
use crate::util::net::is_virtual_interface;
use crate::connection::infer_connection_type;
use crate::util::shell::{trimmed_non_empty, try_run, try_run_powershell};
use crate::connection::ConnectionDetails;
use crate::connection::interfaces::InterfaceSummary;
use std::net::Ipv4Addr;

/// The default route Windows forwards through, ranked so a VPN tunnel never
/// passes for the LAN uplink.
///
/// `Find-NetRoute -RemoteIPAddress 8.8.8.8` gives the *effective* route, which
/// is the tunnel once a VPN is up, and device discovery would then scan the
/// tunnel's point-to-point range and find nothing. Modern VPNs (WireGuard,
/// NordLynx, Mullvad, OpenVPN) route through `0.0.0.0/1` + `128.0.0.0/1` and
/// leave the adapter's own `0.0.0.0/0` in place, so the LAN route is still
/// there to find. Every default route is ranked, like macOS's
/// `pick_default_route`:
///
///  1. `Status -eq 'Up'`: rejects the stale metric-0 default Windows keeps on
///     a just-unplugged Ethernet adapter.
///  2. `HardwareInterface` first: puts a physical NIC above any tunnel without
///     matching vendor names. A Hyper-V "vEthernet" adapter isn't hardware, but
///     when it holds the only default route (the NIC is bound to the vSwitch)
///     it still wins from the second tier.
///  3. Lowest route + interface metric, which prefers Ethernet over Wi-Fi as
///     Windows does.
///
/// `field` is `InterfaceAlias` or `NextHop`, so the interface and gateway come
/// from the same ranking and can't disagree.
fn default_route_field(field: &str) -> String {
    // Safe to splice: `field` is always one of the two literals passed below.
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
    if let Some(out) = try_run_powershell(
        "(Get-DnsClientServerAddress -AddressFamily IPv4).ServerAddresses | Select-Object -Unique",
    )
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
    let (out, default) = tokio::join!(
        try_run_powershell(WINDOWS_ADAPTERS),
        crate::connection::default_interface()
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
        let mac = parts
            .next()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(crate::util::net::normalize_mac_colons);
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

pub async fn wifi_details() -> ConnectionDetails {
    let Some(out) = try_run("netsh wlan show interfaces").await else {
        return ConnectionDetails::default();
    };
    parse_netsh_wifi(&out)
}

fn parse_netsh_wifi(out: &str) -> ConnectionDetails {
    let mut d = ConnectionDetails::default();
    let mut band_ghz: Option<f64> = None;
    // Match whole-line "Key : Value" labels only. For Wi-Fi 6E/7 APs netsh
    // prints a "Colocated APs" block whose inline "Band:"/"Channel:" values
    // come before the real ones, so a first match would take a colocated
    // radio's "Channel: 1" over the connected "Channel : 101".
    for line in out.lines() {
        let Some((key, value)) = line.split_once(':') else { continue };
        let (key, value) = (key.trim(), value.trim());
        match key {
            "SSID" => d.ssid = trimmed_non_empty(value),
            "Signal" => d.signal_strength = value.trim_end_matches('%').trim().parse().ok(),
            "Rssi" => d.signal_dbm = value.parse().ok(),
            "Channel" => d.channel = value.parse().ok(),
            "Band" => band_ghz = value.split_whitespace().next().and_then(|n| n.parse().ok()),
            "Authentication" => d.security = trimmed_non_empty(value),
            "Radio type" => d.wifi_standard = trimmed_non_empty(value),
            _ => {}
        }
    }

    // netsh gives band and channel but no frequency, which the UI's band and
    // channel labels are built from on every platform; derive it.
    if let (Some(band), Some(channel)) = (band_ghz, d.channel) {
        d.frequency = channel_to_frequency(band, channel);
    }
    super::finalize_wifi(d)
}

/// The saved passphrase for the `ssid` profile via `netsh wlan show profile …
/// key=clear`. netsh only prints "Key Content" to an elevated caller, so
/// without admin this returns `None`. A double quote can't be escaped inside
/// a `cmd` argument, so any in the SSID is stripped (real SSIDs rarely have
/// one).
pub async fn wifi_password(ssid: &str) -> Option<String> {
    let safe = ssid.replace('"', "");
    let out = try_run(&format!("netsh wlan show profile name=\"{safe}\" key=clear")).await?;
    out.lines()
        .find_map(|line| line.trim().strip_prefix("Key Content"))
        .and_then(|rest| rest.split_once(':'))
        .map(|(_, value)| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

/// Centre frequency (MHz) for `channel` in a band given in GHz; `None` for an
/// unknown band.
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
    // `connection_details` already validates `iface`, but this is pub.
    if !crate::util::net::is_shell_safe_iface(iface) {
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

/// Negotiated link rate (Mbps) from `Get-NetAdapter`. Used for Wi-Fi, where
/// `netsh` has no single figure, so the connection card and speed-test footer
/// match the interface list.
pub async fn link_speed(iface: &str) -> Option<i64> {
    if !crate::util::net::is_shell_safe_iface(iface) {
        return None;
    }
    let out = try_run_powershell(&format!(
        "(Get-NetAdapter -Name '{iface}' -ErrorAction SilentlyContinue).LinkSpeed"
    ))
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
        Some((value * 1000.0) as i64)
    } else {
        Some(value as i64)
    }
}

/// The interface's IPv4 address and prefix length via `Get-NetIPAddress`.
/// `None` when the adapter has no usable IPv4.
///
/// sysinfo's `ip_networks()` intermittently reports no IPv4 on Windows, which
/// left the scan with no subnet. APIPA (169.254/16) is skipped so a
/// half-configured adapter doesn't scope the scan to its link-local range.
pub async fn subnet_of(interface: &str) -> Option<(Ipv4Addr, u32)> {
    if !crate::util::net::is_shell_safe_iface(interface) {
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
        .map(|minutes| (minutes * 60.0) as i64)
}

#[cfg(test)]
mod tests {
    use super::*;

    // A Wi-Fi 6E connection whose AP advertises colocated 2.4/5 GHz radios,
    // listed with "Channel: 1" and "Channel: 60" before the real
    // "Channel : 101". The parser must pick neither.

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
