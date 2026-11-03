//! macOS host/network probes: `ifconfig`, `netstat`, `networksetup`,
//! `system_profiler` and the Keychain via `security`. CoreWLAN reads live in
//! [`super::mac_native`].
use crate::connection::ConnectionDetails;
use crate::utils::net::is_virtual_interface;
use crate::utils::shell::{trimmed_non_empty, try_run};
use std::collections::HashMap;
use std::net::Ipv4Addr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

pub async fn wifi_details(iface: &str) -> ConnectionDetails {
    // On macOS 14+ the SSID sits behind Location Services and only CoreWLAN,
    // in-process, can read it; every shell tool prints "<redacted>".
    let mut d = ConnectionDetails { ssid: super::mac_native::current_ssid(), ..Default::default() };
    // `networksetup` is redacted too without Location access, but harmless to
    // try.
    if d.ssid.is_none() && crate::utils::net::is_shell_safe_iface(iface) {
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

    // Signal, channel, security and rate come from `system_profiler`, the only
    // rootless RSSI source left, but it takes seconds. Serve the cached reading
    // and refresh in the background, so the value fills in on the next poll
    // instead of stalling the card.
    apply_cached_signal(&mut d);

    super::finalize_wifi(d)
}

/// The saved Wi-Fi passphrase for `ssid` from the login Keychain, where macOS
/// stores it as a generic password keyed by the network name. Reading it pops
/// the standard Keychain authorisation dialog (Allow / Always Allow / Deny);
/// declining, or a Keychain that has no entry, yields `None`.
pub async fn wifi_password(ssid: &str) -> Option<String> {
    let quoted = crate::utils::net::shell_single_quote(ssid);
    let out = try_run(&format!("security find-generic-password -w -a {quoted} 2>/dev/null")).await?;
    trimmed_non_empty(&out)
}

/// Ethernet link facts for `iface` from a single `ifconfig <iface>`: the
/// negotiated link speed and duplex from its `media:` descriptor. macOS has no
/// `ethtool`, but `ifconfig` reports the same rate string it uses for the
/// interface list, so the connection card and interface list stay consistent.
/// Vendor is left to the caller's OUI fallback; `ifconfig` exposes no adapter
/// vendor/product for the built-in or USB/Thunderbolt NICs.
pub async fn ethernet_details(iface: &str) -> ConnectionDetails {
    let mut d = ConnectionDetails::default();
    // `connection_details` already validates `iface`, but this is pub.
    if !crate::utils::net::is_shell_safe_iface(iface) {
        return d;
    }
    if let Some(out) = try_run(&format!("ifconfig {iface} 2>/dev/null")).await {
        if let Some(media) = out.lines().map(str::trim).find_map(|line| line.strip_prefix("media: ")) {
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

/// Fill `d` from the cached signal reading and, when it's stale, start a
/// background refresh. Never blocks: a cold cache just means the signal shows
/// one poll later.
fn apply_cached_signal(d: &mut ConnectionDetails) {
    let cached = crate::utils::net::lock(&SIGNAL_CACHE).clone();
    let stale = cached.as_ref().is_none_or(|s| s.at.elapsed() > SIGNAL_TTL);
    if stale {
        // The `swap` in the task dedupes concurrent refreshes. `tokio::spawn`
        // needs a runtime, which the async command calling this provides.
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
        *crate::utils::net::lock(&SIGNAL_CACHE) = Some(signal);
    }
    REFRESH_IN_FLIGHT.store(false, Ordering::Release);
}

async fn query_wifi_signal() -> Option<WifiSignal> {
    let out = try_run("system_profiler SPAirPortDataType 2>/dev/null").await?;
    parse_wifi_signal(&out)
}

/// Parse the "Current Network Information" block of `system_profiler
/// SPAirPortDataType`. Its first child is the SSID (or `<redacted>`); deeper
/// `Key: value` lines carry the stats. Stops at the next section (same or
/// lesser indent).
fn parse_wifi_signal(out: &str) -> Option<WifiSignal> {
    let indent = |line: &str| line.len() - line.trim_start().len();
    let mut lines = out.lines();
    let header = lines.by_ref().find(|l| l.trim() == "Current Network Information:")?;
    let base = indent(header);

    let mut reading = WifiSignal {
        ssid: None,
        signal_dbm: None,
        channel: None,
        frequency: None,
        security: None,
        wifi_standard: None,
        link_speed_mbps: None,
        at: Instant::now(),
    };
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
            // The network name line ("<SSID>:"); first one wins. Skip
            // "<redacted>" (no Location permission) but keep the stats below.
            let name = key.trim();
            if reading.ssid.is_none() && name != "<redacted>" {
                reading.ssid = Some(name.to_string());
            }
        } else {
            match key.trim() {
                // "Signal / Noise: -45 dBm / -80 dBm" → -45
                "Signal / Noise" => {
                    reading.signal_dbm = value.split_whitespace().next().and_then(|v| v.parse().ok());
                }
                // "Channel: 44 (5GHz, 80MHz)" → 44, plus the centre frequency
                // the frontend labels the band from.
                "Channel" => {
                    reading.channel = value.split_whitespace().next().and_then(|v| v.parse().ok());
                    reading.frequency = reading.channel.and_then(|ch| channel_to_frequency(ch, value));
                }
                // "PHY Mode: 802.11ax" → the frontend maps this to "Wi‑Fi 6".
                "PHY Mode" => reading.wifi_standard = Some(value.to_string()),
                "Security" => reading.security = Some(value.to_string()),
                "Transmit Rate" => reading.link_speed_mbps = value.parse().ok(),
                _ => {}
            }
        }
    }

    // Without a signal the reading is worthless, even with an SSID.
    reading.signal_dbm?;
    Some(reading)
}

/// Wi-Fi channel to centre frequency (MHz). Channel numbers repeat across
/// bands (6 GHz reuses 2.4 GHz numbers), so `system_profiler`'s band hint
/// ("2GHz", "5GHz", "6GHz") decides, falling back to channel ranges.
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
/// (`utun*`) or VM bridge can outrank the physical link, so `route -n get
/// default` alone can land on an interface with no address, no gateway and the
/// wrong subnet. See `pick_default_route`.
pub async fn best_default_route() -> Option<(String, Option<String>)> {
    let out = try_run("netstat -rn -f inet 2>/dev/null").await?;
    pick_default_route(&out)
}

/// Choose the physical default route from `netstat -rn -f inet`. A VPN tunnel
/// or VM bridge (`bridge100`) keeps its own default route that can outrank, or
/// outlive, the physical link: turn Wi-Fi off with a VM running and only the
/// bridge's is left. Virtual interfaces are never chosen, so an all-virtual
/// table gives `None` ("disconnected", not a phantom wired link). A physical
/// link whose gateway didn't parse is the last resort, with gateway `None`.
fn pick_default_route(out: &str) -> Option<(String, Option<String>)> {
    let mut physical_no_gw: Option<(String, Option<String>)> = None;
    for line in out.lines() {
        // "default  <gateway>  <flags>  <netif>[  <expire>]"
        let cols: Vec<&str> = line.split_whitespace().collect();
        if cols.len() < 4 || cols[0] != "default" {
            continue;
        }
        let iface = cols[3].to_string();
        // Tunnels and bridges route packets but aren't the uplink; taking one
        // was the bridge100-shows-as-"Wired" bug.
        if is_virtual_interface(&iface) {
            continue;
        }
        let gw = cols[1].parse::<Ipv4Addr>().ok().map(|ip| ip.to_string());
        if gw.is_some() {
            return Some((iface, gw));
        }
        physical_no_gw.get_or_insert((iface, gw));
    }
    physical_no_gw
}

/// The last good Wi-Fi hardware-port map. The layout doesn't change while the
/// machine runs, so a later `networksetup` hiccup reuses it rather than letting
/// `en0` fall through to "ethernet", which flip-flops the connection type and
/// fires spurious connect events.
static WIFI_DEVICES_CACHE: Mutex<Option<Vec<String>>> = Mutex::new(None);

/// The `enN` devices on a "Wi-Fi" hardware port. macOS names Wi-Fi `enN` like
/// Ethernet, so the name heuristic can't tell them apart. Empty only before
/// the first good read, so callers can fall back.
pub async fn wifi_devices() -> Vec<String> {
    let devices = try_run("networksetup -listallhardwareports 2>/dev/null")
        .await
        .map(|out| parse_wifi_devices(&out))
        .unwrap_or_default();
    // A failed probe and an empty parse (unexpected output) both keep the last
    // good map.
    if devices.is_empty() {
        return crate::utils::net::lock(&WIFI_DEVICES_CACHE).clone().unwrap_or_default();
    }
    *crate::utils::net::lock(&WIFI_DEVICES_CACHE) = Some(devices.clone());
    devices
}

/// Extract the `enN` devices under a "Wi-Fi" hardware port from
/// `networksetup -listallhardwareports` output.
fn parse_wifi_devices(out: &str) -> Vec<String> {
    let mut devices = Vec::new();
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

/// Per-interface facts from one `ifconfig -a`: oper state, first IPv4 and
/// (Ethernet only) link speed. sysinfo's IPv4 can lag `ifconfig` and it has no
/// link speed, so the macOS list builder enriches its list from here.
#[derive(Default, Clone)]
pub struct IfaceInfo {
    pub oper_state: Option<String>,
    pub ipv4: Option<String>,
    pub speed_mbps: Option<i64>,
}

/// `ifconfig -a` as a per-interface [`IfaceInfo`] map. Interfaces missing from
/// it keep their sysinfo values.
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
            // First IPv4 wins.
            if entry.ipv4.is_none() {
                entry.ipv4 = rest.split_whitespace().next().map(str::to_string);
            }
        } else if let Some(media) = line.strip_prefix("media: ") {
            entry.speed_mbps = parse_media_speed(media);
        }
    }
    map
}

/// Link speed (Mbps) from an `ifconfig` `media:` descriptor:
/// "autoselect (1000baseT <full-duplex,flow-control>)" → 1000, "100baseTX" →
/// 100, "10GbaseT" → 10000. Wi-Fi shows a bare "autoselect", so `None` there
/// (CoreWLAN supplies Wi-Fi speed).
fn parse_media_speed(media: &str) -> Option<i64> {
    // The rate is in a "<N>base…" or "<N>Gbase…" token.
    let token = media.split(|c: char| !c.is_ascii_alphanumeric()).find(|t| t.to_ascii_lowercase().contains("base"))?;
    let lower = token.to_ascii_lowercase();
    let (mut num, _) = lower.split_at(lower.find("base")?);
    let gigabit = num.ends_with('g');
    if gigabit {
        num = &num[..num.len() - 1];
    }
    let n: i64 = num.parse().ok()?;
    Some(if gigabit { n * 1000 } else { n })
}

/// Duplex from an `ifconfig` `media:` descriptor's option list, e.g.
/// "<full-duplex,flow-control>" → "full", the lowercase token the UI expects.
/// `None` without a hint (Wi-Fi, or a down link's bare "autoselect").
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

    #[test]
    fn default_route_prefers_physical_with_gateway() {
        // en0 (Wi-Fi) has a real gateway; bridge100 (a VM bridge) also holds a
        // default route. The physical, gatewayed link must win regardless of order.
        let out = "\
Routing tables

Internet:
Destination        Gateway            Flags        Netif Expire
default            192.168.2.1        UGScg          en0
default            link#24            UCSIg      bridge100      !
";
        assert_eq!(pick_default_route(out), Some(("en0".to_string(), Some("192.168.2.1".to_string()))));
    }

    #[test]
    fn default_route_ignores_virtual_only_table() {
        // Wi-Fi is off, so en0's default route is gone and only the VM bridge's
        // remains. bridge100 isn't a real uplink, so the machine reads as
        // disconnected (None) rather than a phantom "Wired connection".
        let out = "\
Routing tables

Internet:
Destination        Gateway            Flags        Netif Expire
default            link#24            UCSIg      bridge100      !
";
        assert_eq!(pick_default_route(out), None);
    }

    #[test]
    fn default_route_falls_back_to_physical_without_gateway() {
        // A physical link whose gateway didn't parse still beats a virtual route:
        // it's returned with gateway None rather than dropped in favour of utun0.
        let out = "\
Routing tables

Internet:
Destination        Gateway            Flags        Netif Expire
default            link#24            UCSIg          utun0
default            link#11            UCSg           en0
";
        assert_eq!(pick_default_route(out), Some(("en0".to_string(), None)));
    }

    #[test]
    fn wifi_devices_parses_only_the_wifi_port() {
        // macOS names Wi-Fi `enN` just like Ethernet; only the port header
        // distinguishes them.
        let out = "\
Hardware Port: Ethernet
Device: en1
Ethernet Address: aa:bb:cc:dd:ee:01

Hardware Port: Wi-Fi
Device: en0
Ethernet Address: aa:bb:cc:dd:ee:00

Hardware Port: Thunderbolt Bridge
Device: bridge0
";
        assert_eq!(parse_wifi_devices(out), vec!["en0".to_string()]);
    }

    #[test]
    fn wifi_devices_falls_back_to_last_good_on_transient_failure() {
        // The cache is process-wide and would race the real probe, so this
        // pins what the fallback relies on: an unusable probe parses to empty.
        let good = parse_wifi_devices("Hardware Port: Wi-Fi\nDevice: en0\n");
        assert_eq!(good, vec!["en0".to_string()]);
        // Nothing, or no Wi-Fi port, parses to empty: the cue to reuse the cache.

        assert!(parse_wifi_devices("").is_empty());
        assert!(parse_wifi_devices("Hardware Port: Ethernet\nDevice: en1\n").is_empty());
    }
}
