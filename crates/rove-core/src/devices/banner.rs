//! HTTP banner grab — cheap identity for hosts that run a web UI but stay quiet
//! on mDNS/SSDP (routers, IP cameras, NAS boxes, printers).
//!
//! For each host the probe already found listening on HTTP, one `GET /` yields
//! two identity hints at near-zero extra cost: the `Server` response header
//! (httpd / product string) and the page `<title>`. Pure Rust (`reqwest`), so
//! it runs the same on every OS.
//!
//! Scope note: only plaintext HTTP (port 80) is grabbed. LAN HTTPS is almost
//! always a self-signed cert that a correct TLS stack rejects, and reading it
//! for a banner would mean disabling verification — deliberately left out to
//! keep Rove's no-danger-knobs posture. Certificate CN/SAN parsing is a
//! possible future addition behind an explicit opt-in.
use futures_util::StreamExt;
use std::collections::HashMap;
use std::time::Duration;

/// HTTP ports worth a banner grab. Kept to plaintext HTTP (see module note).
const HTTP_PORTS: &[u16] = &[80];
/// Concurrent grabs; each is one short LAN HTTP round-trip.
const CONCURRENT_GRABS: usize = 64;
const GRAB_TIMEOUT: Duration = Duration::from_millis(1200);
/// Only read the first slice of the body — the `<title>` is in the `<head>`,
/// and this bounds memory against a host that streams megabytes.
const MAX_BODY_BYTES: usize = 16 * 1024;

/// Identity hints scraped from a host's HTTP response.
#[derive(Debug, Clone, Default)]
pub struct BannerHit {
    /// The `Server` response header, e.g. "lighttpd/1.4", "RomPager".
    pub server: Option<String>,
    /// The page `<title>`, e.g. "NETGEAR Router" or "Synology DiskStation".
    pub title: Option<String>,
}

impl BannerHit {
    /// Server header and title joined into one string for regex identity
    /// matching, or `None` when the grab yielded nothing.
    pub fn identity(&self) -> Option<String> {
        match (&self.server, &self.title) {
            (Some(s), Some(t)) => Some(format!("{s} {t}")),
            (Some(s), None) => Some(s.clone()),
            (None, Some(t)) => Some(t.clone()),
            (None, None) => None,
        }
    }
}

/// Grab HTTP banners for every host in `open_ports` that has an HTTP port open,
/// keyed by IP. Hosts with no banner (or no HTTP port) are simply absent.
pub async fn grab(open_ports: &HashMap<String, Vec<u16>>) -> HashMap<String, BannerHit> {
    let targets: Vec<String> = open_ports
        .iter()
        .filter(|(_, ports)| ports.iter().any(|p| HTTP_PORTS.contains(p)))
        .map(|(ip, _)| ip.clone())
        .collect();
    if targets.is_empty() {
        return HashMap::new();
    }

    // `.no_proxy()` so LAN requests never traverse an ambient HTTP proxy.
    let Ok(client) = reqwest::Client::builder()
        .no_proxy()
        .timeout(GRAB_TIMEOUT)
        .build()
    else {
        return HashMap::new();
    };

    let results: Vec<(String, BannerHit)> = futures_util::stream::iter(targets)
        .map(|ip| {
            let client = client.clone();
            async move { grab_one(&client, &ip).await.map(|hit| (ip, hit)) }
        })
        .buffer_unordered(CONCURRENT_GRABS)
        .filter_map(|hit| async move { hit })
        .collect()
        .await;

    results.into_iter().collect()
}

async fn grab_one(client: &reqwest::Client, ip: &str) -> Option<BannerHit> {
    let resp = client.get(format!("http://{ip}/")).send().await.ok()?;

    let server = resp
        .headers()
        .get(reqwest::header::SERVER)
        .and_then(|v| v.to_str().ok())
        .map(crate::net_util::sanitize_display)
        .filter(|s| !s.is_empty());

    // Read at most MAX_BODY_BYTES so a streaming endpoint can't balloon memory.
    let mut body = String::new();
    let mut stream = resp.bytes_stream();
    while let Some(Ok(chunk)) = stream.next().await {
        body.push_str(&String::from_utf8_lossy(&chunk));
        if body.len() >= MAX_BODY_BYTES {
            break;
        }
    }
    let title = extract_title(&body);

    let hit = BannerHit { server, title };
    hit.identity().is_some().then_some(hit)
}

/// Pull the `<title>` inner text (case-insensitive tag), sanitized and bounded.
fn extract_title(html: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let open = lower.find("<title")?;
    let gt = lower[open..].find('>')? + open + 1;
    let close = lower[gt..].find("</title>")? + gt;
    let raw = html[gt..close].trim();
    let title = crate::net_util::sanitize_display(raw);
    (!title.is_empty()).then_some(title)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_title_case_insensitively() {
        assert_eq!(
            extract_title("<html><HEAD><Title> Synology DiskStation </Title></HEAD>").as_deref(),
            Some("Synology DiskStation")
        );
    }

    #[test]
    fn title_with_attributes_is_handled() {
        assert_eq!(
            extract_title(r#"<title id="t">NETGEAR Router</title>"#).as_deref(),
            Some("NETGEAR Router")
        );
    }

    #[test]
    fn missing_title_is_none() {
        assert!(extract_title("<html><head></head></html>").is_none());
    }

    #[test]
    fn identity_joins_server_and_title() {
        let hit = BannerHit { server: Some("RomPager".into()), title: Some("Login".into()) };
        assert_eq!(hit.identity().as_deref(), Some("RomPager Login"));
        let only_title = BannerHit { server: None, title: Some("HP LaserJet".into()) };
        assert_eq!(only_title.identity().as_deref(), Some("HP LaserJet"));
        assert!(BannerHit::default().identity().is_none());
    }
}
