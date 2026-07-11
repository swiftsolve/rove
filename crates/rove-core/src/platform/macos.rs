//! macOS host/network probes: `ifconfig`, `netstat`, `networksetup` and
//! `system_profiler`.
use crate::net_util::is_virtual_interface;
use crate::shell::try_run;
use crate::types::ConnectionDetails;
use std::collections::HashMap;
use std::net::Ipv4Addr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

pub async fn wifi_details(iface: &str) -> ConnectionDetails {
    let mut d = ConnectionDetails::default();
    // The SSID lives behind Location Services on macOS 14+ and is only reachable
    // in-process via CoreWLAN — every shell tool returns "<redacted>".
    d.ssid = super::mac_native::current_ssid();
    // Last resort: `networksetup` (also redacted without Location access, but
    // harmless to try).
    if d.ssid.is_none() && crate::net_util::is_shell_safe_iface(iface) {
        if let Some(out) = try_run(&format!("networksetup -getairportnetwork {iface}")).await {
            // Success: "Current Wi-Fi Network: <SSID>". Otherwise a message with
            // no colon ("You are not associated with an AirPort network.").
            if let Some((_, ssid)) = out.split_once(':') {
                let ssid = ssid.trim();
                if !ssid.is_empty() && !out.contains("not associated") && !out.contains("not a Wi-Fi") {
                    d.ssid = Some(ssid.to_string());
                }
            }
        }
    }

    // Signal strength (and channel/security/rate) come from `system_profiler`,
    // the only rootless RSSI source left on modern macOS — but it takes seconds.
    // Serve the last cached reading immediately and refresh in the background so
    // the value fills in on the next poll rather than stalling the whole card.
    apply_cached_signal(&mut d);

    super::finalize_wifi(d)
}

/// The saved Wi-Fi passphrase for `ssid` from the login Keychain, where macOS
/// stores it as a generic password keyed by the network name. Reading it pops
/// the standard Keychain authorisation dialog (Allow / Always Allow / Deny);
/// declining, or a Keychain that has no entry, yields `None`.
pub async fn wifi_password(ssid: &str) -> Option<String> {
    let quoted = crate::net_util::shell_single_quote(ssid);
    let out = try_run(&format!(
        "security find-generic-password -w -a {quoted} 2>/dev/null"
    ))
    .await?;
    let pw = out.trim();
    if pw.is_empty() {
        None
    } else {
        Some(pw.to_string())
    }
}

/// Ethernet link facts for `iface` from a single `ifconfig <iface>`: the
/// negotiated link speed and duplex from its `media:` descriptor. macOS has no
/// `ethtool`, but `ifconfig` reports the same rate string it uses for the
/// interface list, so the connection card and interface list stay consistent.
/// Vendor is left to the caller's OUI fallback; `ifconfig` exposes no adapter
/// vendor/product for the built-in or USB/Thunderbolt NICs.
pub async fn ethernet_details(iface: &str) -> ConnectionDetails {
    let mut d = ConnectionDetails::default();
    // Caller (`connection_details`) has already validated `iface`, but this is a
    // pub entry point — keep it safe if called directly.
    if !crate::net_util::is_shell_safe_iface(iface) {
        return d;
    }
    if let Some(out) = try_run(&format!("ifconfig {iface} 2>/dev/null")).await {
        if let Some(media) = out
            .lines()
            .map(str::trim)
            .find_map(|line| line.strip_prefix("media: "))
        {
            d.link_speed_mbps = parse_media_speed(media);
            d.duplex = parse_media_duplex(media);
        }
    }
    d
}

/// Cached `system_profiler` Wi-Fi reading, refreshed off the hot path.
#[derive(Clone)]
struct WifiSignal {
    ssid: Option<String>,
    signal_dbm: Option<i64>,
    channel: Option<i64>,
    frequency: Option<i64>,
    security: Option<String>,
    wifi_standard: Option<String>,
    link_speed_mbps: Option<i64>,
    at: Instant,
}

static SIGNAL_CACHE: Mutex<Option<WifiSignal>> = Mutex::new(None);
static REFRESH_IN_FLIGHT: AtomicBool = AtomicBool::new(false);
const SIGNAL_TTL: Duration = Duration::from_secs(12);

/// Fill `d` with the last cached signal reading and, when it's stale, kick off a
/// background `system_profiler` refresh. Never blocks: a cold cache just means
/// the signal appears one poll later.
fn apply_cached_signal(d: &mut ConnectionDetails) {
    let cached = crate::net_util::lock(&SIGNAL_CACHE).clone();
    let stale = cached.as_ref().map_or(true, |s| s.at.elapsed() > SIGNAL_TTL);
    if stale {
        // `swap` inside the task dedupes concurrent refreshes; spawning needs the
        // Tokio runtime this fn always runs under (called from an async command).
        tokio::spawn(refresh_signal_cache());
    }
    if let Some(s) = cached {
        d.ssid = d.ssid.take().or(s.ssid);
        d.signal_dbm = d.signal_dbm.or(s.signal_dbm);
        d.channel = d.channel.or(s.channel);
        d.frequency = d.frequency.or(s.frequency);
        d.security = d.security.take().or(s.security);
        d.wifi_standard = d.wifi_standard.take().or(s.wifi_standard);
        d.link_speed_mbps = d.link_speed_mbps.or(s.link_speed_mbps);
    }
}

async fn refresh_signal_cache() {
    if REFRESH_IN_FLIGHT.swap(true, Ordering::AcqRel) {
        return; // another refresh is already running
    }
    if let Some(signal) = query_wifi_signal().await {
        *crate::net_util::lock(&SIGNAL_CACHE) = Some(signal);
    }
    REFRESH_IN_FLIGHT.store(false, Ordering::Release);
}

async fn query_wifi_signal() -> Option<WifiSignal> {
    let out = try_run("system_profiler SPAirPortDataType 2>/dev/null").await?;
    parse_wifi_signal(&out)
}

/// Parse the "Current Network Information" block of `system_profiler
/// SPAirPortDataType`. The block's first indented child is the SSID (or
/// `<redacted>` when macOS withholds it); deeper `Key: value` lines carry the
/// stats. Stops at the next section (equal-or-lesser indent).
fn parse_wifi_signal(out: &str) -> Option<WifiSignal> {
    let indent = |line: &str| line.len() - line.trim_start().len();
    let mut lines = out.lines();
    let header = lines
        .by_ref()
        .find(|l| l.trim() == "Current Network Information:")?;
    let base = indent(header);

    let (mut ssid, mut signal_dbm, mut channel, mut frequency, mut security, mut wifi_standard, mut link_speed_mbps) =
        (None, None, None, None, None, None, None);
    for line in lines {
        if line.trim().is_empty() {
            continue;
        }
        if indent(line) <= base {
            break; // next section ("Other Local Wi-Fi Networks", etc.)
        }
        let Some((key, value)) = line.trim().split_once(':') else {
            continue;
        };
        let value = value.trim();
        if value.is_empty() {
            // The network name line ("<SSID>:"); first one wins. macOS prints
            // "<redacted>" when it withholds the SSID (no Location permission) —
            // not a real name, so skip it and keep the stats below.
            let name = key.trim();
            if ssid.is_none() && name != "<redacted>" {
                ssid = Some(name.to_string());
            }
        } else {
            match key.trim() {
                // "Signal / Noise: -45 dBm / -80 dBm" → -45
                "Signal / Noise" => {
                    signal_dbm = value.split_whitespace().next().and_then(|v| v.parse().ok());
                }
                // "Channel: 44 (5GHz, 80MHz)" → channel 44 + centre frequency,
                // from which the frontend labels the band and channel.
                "Channel" => {
                    channel = value.split_whitespace().next().and_then(|v| v.parse().ok());
                    frequency = channel.and_then(|ch| channel_to_frequency(ch, value));
                }
                // "PHY Mode: 802.11ax" → the frontend maps this to "Wi‑Fi 6".
                "PHY Mode" => wifi_standard = Some(value.to_string()),
                "Security" => security = Some(value.to_string()),
                "Transmit Rate" => link_speed_mbps = value.parse().ok(),
                _ => {}
            }
        }
    }

    // A redacted SSID with no stats is worthless; require at least a real signal.
    if signal_dbm.is_none() {
        return None;
    }
    Some(WifiSignal {
        ssid,
        signal_dbm,
        channel,
        frequency,
        security,
        wifi_standard,
        link_speed_mbps,
        at: Instant::now(),
    })
}

/// Wi‑Fi channel → representative centre frequency (MHz). The band is ambiguous
/// from the channel number alone (6E reuses 2.4 GHz numbers), so `system_profiler`'s
/// band hint ("5GHz", "2GHz", "6GHz") disambiguates; fall back to channel ranges.
fn channel_to_frequency(channel: i64, band_hint: &str) -> Option<i64> {
    use super::WifiBand;
    let band = if band_hint.contains("6GHz") {
        WifiBand::Six
    } else if band_hint.contains("5GHz") {
        WifiBand::Five
    } else if band_hint.contains("2GHz") {
        WifiBand::TwoFour
    } else {
        match channel {
            1..=14 => WifiBand::TwoFour,
            32..=196 => WifiBand::Five,
            _ => return None,
        }
    };
    Some(super::channel_to_frequency(band, channel))
}

/// The preferred IPv4 default route as `(interface, gateway)`. A VPN tunnel
/// (`utun*`) or VM bridge can outrank the physical link in the routing table, so
/// `route -n get default` alone lands on an interface with no address, no
/// gateway and the wrong subnet. Prefer a non-virtual interface that carries a
/// real IPv4 gateway; degrade gracefully when none does.
pub async fn best_default_route() -> Option<(String, Option<String>)> {
    let out = try_run("netstat -rn -f inet 2>/dev/null").await?;
    let mut physical_no_gw: Option<(String, Option<String>)> = None;
    let mut any: Option<(String, Option<String>)> = None;
    for line in out.lines() {
        // "default  <gateway>  <flags>  <netif>[  <expire>]"
        let cols: Vec<&str> = line.split_whitespace().collect();
        if cols.len() < 4 || cols[0] != "default" {
            continue;
        }
        let iface = cols[3].to_string();
        let gw = cols[1].parse::<Ipv4Addr>().ok().map(|ip| ip.to_string());
        any.get_or_insert_with(|| (iface.clone(), gw.clone()));
        if !is_virtual_interface(&iface) {
            if gw.is_some() {
                return Some((iface, gw)); // physical link with a real gateway — ideal
            }
            physical_no_gw.get_or_insert((iface, gw));
        }
    }
    physical_no_gw.or(any)
}

/// `enN` device names bound to a "Wi-Fi" hardware port. macOS names Wi-Fi
/// interfaces `enN` just like Ethernet, so the cross-platform name heuristic
/// can't tell them apart — this hardware-port map is the authoritative source.
/// Empty when `networksetup` is unavailable, letting callers fall back.
pub async fn wifi_devices() -> Vec<String> {
    let mut devices = Vec::new();
    let Some(out) = try_run("networksetup -listallhardwareports 2>/dev/null").await else {
        return devices;
    };
    let mut in_wifi = false;
    for line in out.lines() {
        let line = line.trim();
        if let Some(port) = line.strip_prefix("Hardware Port:") {
            in_wifi = port.trim().eq_ignore_ascii_case("Wi-Fi");
        } else if let Some(dev) = line.strip_prefix("Device:") {
            let dev = dev.trim();
            if in_wifi && !dev.is_empty() {
                devices.push(dev.to_string());
            }
        }
    }
    devices
}

/// "wifi" or "ethernet" for `iface`, resolved through the hardware-port map.
pub async fn connection_type_for(iface: &str) -> &'static str {
    if wifi_devices().await.iter().any(|d| d == iface) {
        "wifi"
    } else {
        "ethernet"
    }
}

/// Per-interface facts scraped from a single `ifconfig -a`: oper-state, the
/// first IPv4 address, and (Ethernet only) the negotiated link speed. sysinfo
/// already gives names/MACs/IPs, but its IPv4 view can lag `ifconfig`, and it
/// exposes no link speed at all — so the macOS list builder enriches from here.
#[derive(Default, Clone)]
pub struct IfaceInfo {
    pub oper_state: Option<String>,
    pub ipv4: Option<String>,
    pub speed_mbps: Option<i64>,
}

/// Parse `ifconfig -a` into a per-interface [`IfaceInfo`] map, one shell call.
/// Interfaces absent from the map keep their sysinfo-derived defaults.
pub async fn interface_info() -> HashMap<String, IfaceInfo> {
    let mut map: HashMap<String, IfaceInfo> = HashMap::new();
    // Blocks like:
    //   en0: flags=8863<UP,...> mtu 1500
    //   \tinet 192.168.2.16 netmask 0xffffff00 broadcast 192.168.2.255
    //   \tmedia: autoselect (1000baseT <full-duplex>)
    //   \tstatus: active
    let Some(out) = try_run("ifconfig -a 2>/dev/null").await else {
        return map;
    };
    let mut current = String::new();
    for line in out.lines() {
        if !line.starts_with(char::is_whitespace) {
            current = line.split(':').next().unwrap_or("").to_string();
            continue;
        }
        let entry = map.entry(current.clone()).or_default();
        let line = line.trim();
        if let Some(status) = line.strip_prefix("status: ") {
            entry.oper_state = Some(if status.trim() == "active" { "up" } else { "down" }.into());
        } else if let Some(rest) = line.strip_prefix("inet ") {
            // First IPv4 wins ("inet 192.168.2.16 netmask ...").
            if entry.ipv4.is_none() {
                entry.ipv4 = rest.split_whitespace().next().map(str::to_string);
            }
        } else if let Some(media) = line.strip_prefix("media: ") {
            entry.speed_mbps = parse_media_speed(media);
        }
    }
    map
}

/// Pull a link speed (Mbps) from an `ifconfig` `media:` descriptor, e.g.
/// "autoselect (1000baseT <full-duplex,flow-control>)" → 1000, or "100baseTX" →
/// 100, or "10GbaseT" → 10000. Wi-Fi reports a bare "autoselect" with no rate,
/// so this returns `None` there (CoreWLAN supplies Wi-Fi speed instead).
fn parse_media_speed(media: &str) -> Option<i64> {
    // The rate lives in a "<N>base…" or "<N>Gbase…" token; scan for it.
    let token = media
        .split(|c: char| !c.is_ascii_alphanumeric())
        .find(|t| t.to_ascii_lowercase().contains("base"))?;
    let lower = token.to_ascii_lowercase();
    let (mut num, _) = lower.split_at(lower.find("base")?);
    let gigabit = num.ends_with('g'); // "10G" → 10 Gbps
    if gigabit {
        num = &num[..num.len() - 1];
    }
    let n: i64 = num.parse().ok()?;
    Some(if gigabit { n * 1000 } else { n })
}

/// Duplex from an `ifconfig` `media:` descriptor. The mode lives in the
/// angle-bracketed option list, e.g. "autoselect (1000baseT <full-duplex,
/// flow-control>)" → "full". Returns the lowercase token the UI's duplex
/// formatter expects; `None` when the media line carries no duplex hint (Wi-Fi,
/// or a down link reporting "autoselect" alone).
fn parse_media_duplex(media: &str) -> Option<String> {
    let lower = media.to_ascii_lowercase();
    if lower.contains("full-duplex") {
        Some("full".to_string())
    } else if lower.contains("half-duplex") {
        Some("half".to_string())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn media_speed_and_duplex() {
        let m = "autoselect (1000baseT <full-duplex,flow-control>)";
        assert_eq!(parse_media_speed(m), Some(1000));
        assert_eq!(parse_media_duplex(m), Some("full".into()));

        assert_eq!(parse_media_speed("100baseTX <half-duplex>"), Some(100));
        assert_eq!(parse_media_duplex("100baseTX <half-duplex>"), Some("half".into()));

        assert_eq!(parse_media_speed("10GbaseT <full-duplex>"), Some(10_000));

        // Wi-Fi / down link: no rate, no duplex hint.
        assert_eq!(parse_media_speed("autoselect"), None);
        assert_eq!(parse_media_duplex("autoselect"), None);
    }
}
