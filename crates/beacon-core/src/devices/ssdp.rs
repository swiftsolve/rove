//! SSDP / UPnP discovery — a credential-free, cross-platform identity source.
//!
//! Many consumer devices (smart TVs, media renderers, printers, game consoles,
//! IoT hubs) answer an SSDP `M-SEARCH` even when they drop ICMP and refuse the
//! TCP ports the sweep knocks on, so this both *finds* a few otherwise-silent
//! hosts and, more often, *names* them: each responder points at a description
//! XML carrying a friendly name, model and device type.
//!
//! Pure Rust — a `tokio` UDP socket for the search and `reqwest` for the
//! description fetch — so it runs identically on Linux, macOS and Windows with
//! no platform branch (unlike the neighbor-table / Wi-Fi probes).
use futures_util::StreamExt;
use std::collections::HashMap;
use std::net::{Ipv4Addr, SocketAddr};
use std::time::{Duration, Instant};
use tokio::net::UdpSocket;

const SSDP_MULTICAST: (Ipv4Addr, u16) = (Ipv4Addr::new(239, 255, 255, 250), 1900);

/// Cap on responders whose description we fetch, so a hostile or broken LAN
/// can't fan this out unboundedly. Comfortably above any real home network.
const MAX_RESPONDERS: usize = 128;
/// Concurrent description fetches. Each is a short HTTP round-trip on the LAN.
const CONCURRENT_FETCHES: usize = 32;
/// Per-description HTTP timeout — LAN hosts answer in single-digit ms; this only
/// bounds the wait on a device that advertised a stale/unreachable LOCATION.
const FETCH_TIMEOUT: Duration = Duration::from_millis(1500);

/// What a device's UPnP description says about it. Mirrors [`crate::mdns::MdnsHit`]
/// so the classifier and name-preference chain treat it as one more signal.
#[derive(Debug, Clone, Default)]
pub struct SsdpHit {
    /// UPnP `friendlyName`, e.g. "Living Room TV".
    pub name: Option<String>,
    /// UPnP `modelName`, e.g. "BRAVIA KD-55X".
    pub model: Option<String>,
    /// UPnP `manufacturer`, e.g. "Sony".
    pub manufacturer: Option<String>,
    /// UPnP `deviceType` URN, e.g. "urn:schemas-upnp-org:device:MediaRenderer:1".
    pub device_type: Option<String>,
}

/// Discover UPnP devices within `window`, keyed by IPv4. `local_ip`, when known,
/// is the address of the active interface: binding the search socket to it makes
/// the `M-SEARCH` leave the right adapter on multi-homed and Windows hosts.
pub async fn discover(window: Duration, local_ip: Option<Ipv4Addr>) -> HashMap<String, SsdpHit> {
    let deadline = Instant::now() + window;
    // Spend most of the window collecting responses, leaving a slice for the
    // description fetches so the whole probe stays within (roughly) the window.
    let search_window = window.mul_f32(0.6);

    let locations = match search(search_window, local_ip).await {
        Ok(map) => map,
        Err(_) => return HashMap::new(),
    };
    if locations.is_empty() {
        return HashMap::new();
    }

    fetch_descriptions(locations, deadline).await
}

/// Send `M-SEARCH` and collect one description URL (`LOCATION`) per responder IP.
async fn search(
    window: Duration,
    local_ip: Option<Ipv4Addr>,
) -> std::io::Result<HashMap<String, String>> {
    let bind_ip = local_ip.unwrap_or(Ipv4Addr::UNSPECIFIED);
    let socket = UdpSocket::bind((bind_ip, 0)).await?;

    // MX=2: ask devices to spread replies over ~2 s so bursts don't get dropped.
    let msearch = b"M-SEARCH * HTTP/1.1\r\n\
HOST: 239.255.255.250:1900\r\n\
MAN: \"ssdp:discover\"\r\n\
MX: 2\r\n\
ST: ssdp:all\r\n\r\n";
    // Two sends: the first datagram is the one most often lost while a NIC wakes.
    let _ = socket.send_to(msearch, SSDP_MULTICAST).await;
    let _ = socket.send_to(msearch, SSDP_MULTICAST).await;

    let mut locations: HashMap<String, String> = HashMap::new();
    let mut buf = vec![0u8; 2048];
    let deadline = Instant::now() + window;

    loop {
        let now = Instant::now();
        if now >= deadline || locations.len() >= MAX_RESPONDERS {
            break;
        }
        let recv = tokio::time::timeout(deadline - now, socket.recv_from(&mut buf)).await;
        let Ok(Ok((n, SocketAddr::V4(src)))) = recv else {
            // Timeout (window elapsed) or a non-IPv4 source — stop / skip.
            if recv.is_err() {
                break;
            }
            continue;
        };
        let ip = src.ip().to_string();
        if locations.contains_key(&ip) {
            continue; // one description per device; devices reply once per service.
        }
        if let Some(location) = header_value(&buf[..n], "location") {
            locations.insert(ip, location);
        }
    }

    Ok(locations)
}

/// Fetch and parse each device-description XML concurrently.
async fn fetch_descriptions(
    locations: HashMap<String, String>,
    deadline: Instant,
) -> HashMap<String, SsdpHit> {
    // `.no_proxy()` is essential: LAN description URLs must never be routed
    // through an ambient HTTP(S) proxy. Short connect/overall timeouts keep a
    // dead LOCATION from stalling the scan.
    let Ok(client) = reqwest::Client::builder()
        .no_proxy()
        .timeout(FETCH_TIMEOUT)
        .build()
    else {
        return HashMap::new();
    };

    let results: Vec<(String, SsdpHit)> = futures_util::stream::iter(locations)
        .map(|(ip, url)| {
            let client = client.clone();
            async move {
                if Instant::now() >= deadline {
                    return None;
                }
                let body = client.get(&url).send().await.ok()?.text().await.ok()?;
                let hit = parse_description(&body);
                hit.map(|h| (ip, h))
            }
        })
        .buffer_unordered(CONCURRENT_FETCHES)
        .filter_map(|hit| async move { hit })
        .collect()
        .await;

    results.into_iter().collect()
}

/// Pull an HTTP header value (case-insensitive name) out of an SSDP reply. SSDP
/// replies are HTTP-shaped: a status line then `Name: value` lines.
fn header_value(bytes: &[u8], name: &str) -> Option<String> {
    let text = std::str::from_utf8(bytes).ok()?;
    for line in text.lines() {
        if let Some((key, value)) = line.split_once(':') {
            if key.trim().eq_ignore_ascii_case(name) {
                let value = value.trim();
                if !value.is_empty() {
                    return Some(value.to_string());
                }
            }
        }
    }
    None
}

/// Extract the identity fields from a UPnP device-description XML. The root
/// `<device>` element (first occurrence) is the one we want; nested embedded
/// devices come later and are ignored.
fn parse_description(xml: &str) -> Option<SsdpHit> {
    let name = tag_text(xml, "friendlyName");
    let model = tag_text(xml, "modelName");
    let manufacturer = tag_text(xml, "manufacturer");
    let device_type = tag_text(xml, "deviceType");

    if name.is_none() && model.is_none() && manufacturer.is_none() && device_type.is_none() {
        return None;
    }
    Some(SsdpHit { name, model, manufacturer, device_type })
}

/// First `<tag>…</tag>` inner text, sanitized and bounded. Dependency-free — the
/// descriptions we read are small and flat, so a full XML parser is overkill.
fn tag_text(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let start = xml.find(&open)? + open.len();
    let end = xml[start..].find(&close)? + start;
    let raw = xml[start..end].trim();
    let value = crate::net_util::sanitize_display(raw);
    (!value.is_empty()).then_some(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    const DESC: &str = r#"<?xml version="1.0"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
  <device>
    <deviceType>urn:schemas-upnp-org:device:MediaRenderer:1</deviceType>
    <friendlyName>Living Room TV</friendlyName>
    <manufacturer>Sony</manufacturer>
    <modelName>BRAVIA KD-55X</modelName>
    <device>
      <friendlyName>Embedded Service</friendlyName>
    </device>
  </device>
</root>"#;

    #[test]
    fn parses_root_device_identity() {
        let hit = parse_description(DESC).expect("should parse");
        assert_eq!(hit.name.as_deref(), Some("Living Room TV"));
        assert_eq!(hit.manufacturer.as_deref(), Some("Sony"));
        assert_eq!(hit.model.as_deref(), Some("BRAVIA KD-55X"));
        assert_eq!(
            hit.device_type.as_deref(),
            Some("urn:schemas-upnp-org:device:MediaRenderer:1")
        );
    }

    #[test]
    fn root_friendly_name_wins_over_embedded() {
        // The first friendlyName is the root device, not the embedded service.
        assert_eq!(tag_text(DESC, "friendlyName").as_deref(), Some("Living Room TV"));
    }

    #[test]
    fn description_without_identity_is_none() {
        assert!(parse_description("<root><device></device></root>").is_none());
    }

    #[test]
    fn parses_location_header_case_insensitively() {
        let reply = b"HTTP/1.1 200 OK\r\nCACHE-CONTROL: max-age=1800\r\n\
LOCATION: http://192.168.1.5:8060/dial/dd.xml\r\nST: ssdp:all\r\n\r\n";
        assert_eq!(
            header_value(reply, "location").as_deref(),
            Some("http://192.168.1.5:8060/dial/dd.xml")
        );
    }

    #[test]
    fn missing_header_is_none() {
        let reply = b"HTTP/1.1 200 OK\r\nST: ssdp:all\r\n\r\n";
        assert!(header_value(reply, "location").is_none());
    }
}
