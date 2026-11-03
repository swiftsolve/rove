//! The Diagnostics view's checks: gateway ping, DNS servers, router and ISP
//! identity, and whether this machine has internet at all.
use crate::connection::{default_gateway, default_interface, dns_servers};
use crate::util::shell::try_run_any_status;
use crate::util::tls::handshake_latency;
use regex_lite::Regex;
use serde::Serialize;
use std::sync::LazyLock;
use std::time::Duration;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PingStats {
    pub avg_ms: f64,
    pub jitter_ms: f64,
    pub packet_loss: f64,
}

impl PingStats {
    /// No replies at all: 100% loss, with latency and jitter at the 9999 ms
    /// sentinel the UI reads as "Down".
    pub(crate) const UNREACHABLE: PingStats =
        PingStats { avg_ms: 9999.0, jitter_ms: 9999.0, packet_loss: 100.0 };
}

/// Whether this machine can reach the public internet: the context a service
/// verdict needs. A silent service reads "Down" only when the internet is up;
/// otherwise the failure is ours, and the UI says "can't check" instead.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum InternetStatus {
    /// An internet anchor answered, so service verdicts can be trusted.
    Online,
    /// On a LAN (a default gateway exists) but no anchor answered: the WAN is
    /// down. LAN-local services may still answer.
    NoInternet,
    /// No default gateway, so no usable network.
    Offline,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkDiagnostics {
    pub gateway: Option<String>,
    pub default_interface: Option<String>,
    pub dns_servers: Vec<String>,
    pub gateway_ping: Option<PingStats>,
    /// Public-internet reachability. See [`InternetStatus`].
    pub internet: InternetStatus,
    /// Router make from the gateway's MAC OUI, or None when unknown or
    /// randomized.
    pub gateway_vendor: Option<String>,
    /// Router model from the gateway's SNMP `sysDescr` (or UPnP `modelName`), or
    /// None when it answers neither or reports no usable model.
    pub gateway_model: Option<String>,
    /// Router product name from the gateway's UPnP `friendlyName` (e.g. "Giga Hub
    /// 2.0"), or None when it doesn't announce over SSDP.
    pub gateway_name: Option<String>,
    /// WAN-side identity, or None when even our public IP can't be learned.
    pub isp: Option<IspInfo>,
}

/// WAN-side identity for the ISP card, from the bundled tables plus optional
/// live enrichment (see [`isp_info`]).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IspInfo {
    /// The ISP or organisation name (e.g. "Comcast Cable").
    pub name: Option<String>,
    /// Autonomous-system number, formatted "AS15169".
    pub asn: Option<String>,
    /// The ISP's registered domain (e.g. "bell.ca"), which the card turns into a
    /// brand icon. Only ipwho.is supplies it, so it's absent when that lookup
    /// is rate-limited or down.
    pub domain: Option<String>,
    /// City and region are enrichment-only too. Country also resolves
    /// on-device, so the Location row keeps a country without ipwho.is.
    pub city: Option<String>,
    pub region: Option<String>,
    pub country: Option<String>,
    /// Public IP, from the quota-free echo service that anchors the on-device
    /// lookups, so the most basic field doesn't depend on the enrichment.
    pub public_ip: Option<String>,
    /// Our public IP's ASN is a hosting network, so we're behind a VPN or proxy
    /// and the fields above describe the exit node. Resolved on-device
    /// ([`crate::util::geoip::is_hosting_asn`]), so it holds when the enrichment
    /// is rate-limited.
    pub is_vpn: bool,
}

/// The fast-changing part of diagnostics, polled tightly by the Diagnostics
/// view without re-running the ISP and SNMP lookups, which don't change between
/// polls. The UI merges it over the last full [`NetworkDiagnostics`].
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveDiagnostics {
    pub gateway_ping: Option<PingStats>,
    /// See [`InternetStatus`].
    pub internet: InternetStatus,
}

static PING_TIME: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"time[=<]([\d.]+)\s*ms").unwrap());

/// How long each reply is waited for before it counts as lost.
const PING_REPLY_TIMEOUT_MS: u32 = 1000;

/// Ceiling on the whole `ping` run, well past `count` replies at their
/// interval, so a wedged `ping` can't hang the caller.
const PING_RUN_TIMEOUT: Duration = Duration::from_secs(20);

/// Ping a host and derive average, jitter and loss. None when `ping` can't run;
/// no replies at all is [`PingStats::UNREACHABLE`]. `ping` exits non-zero then,
/// so its output is read whatever the status.
pub async fn ping(host: &str, count: u32) -> Option<PingStats> {
    // `host` goes into a shell command. Callers pass addresses from the kernel,
    // but validate all the same.
    if !crate::util::net::is_shell_safe_ip(host) {
        return None;
    }
    let cmd = crate::platform::ping_command(host, count, PING_REPLY_TIMEOUT_MS);
    let out = try_run_any_status(&cmd, PING_RUN_TIMEOUT).await?;

    let times: Vec<f64> = out
        .lines()
        .filter_map(|line| {
            PING_TIME
                .captures(line)
                .and_then(|c| c.get(1))
                .and_then(|m| m.as_str().parse().ok())
        })
        .collect();

    if times.is_empty() {
        return Some(PingStats::UNREACHABLE);
    }

    let avg = times.iter().sum::<f64>() / times.len() as f64;
    let jitter = if times.len() > 1 {
        times.windows(2).map(|w| (w[1] - w[0]).abs()).sum::<f64>() / (times.len() - 1) as f64
    } else {
        0.0
    };
    let loss = ((count as f64 - times.len() as f64) / count as f64 * 100.0).max(0.0);

    Some(PingStats {
        avg_ms: (avg * 10.0).round() / 10.0,
        jitter_ms: (jitter * 10.0).round() / 10.0,
        packet_loss: (loss * 10.0).round() / 10.0,
    })
}

/// The ISP card's WAN identity, from two sources so it stays populated
/// whenever we're online:
///
///   * **On-device** ([`crate::util::geoip`]): ASN, operator and country from
///     our public IP against the bundled tables. No network, no quota.
///   * **Live enrichment** ([`ipwho_enrich`]): website, city, region and a
///     friendlier ISP name, *when* ipwho.is answers. A rate limit or outage
///     costs only these extras.
///
/// `None` only when we can't learn our own public IP, i.e. we're offline.
pub async fn isp_info() -> Option<IspInfo> {
    // Independent (ipwho.is resolves our address server-side), so concurrent.
    let (public_ip, enrichment) = tokio::join!(crate::connection::public_ip(), ipwho_enrich());
    let live = enrichment.as_ref();

    // ipify preferred as the quota-free anchor. Neither means we're offline.
    let public_ip = public_ip.or_else(|| live.and_then(|e| e.public_ip.clone()))?;

    let asn = crate::util::geoip::asn_info(&public_ip);
    let local_name = asn.as_ref().and_then(|a| a.org.clone());
    let local_asn = asn.as_ref().and_then(|a| a.number).map(|n| format!("AS{n}"));
    let local_country = crate::util::geoip::country_name(&public_ip);

    // Decided from the local AS number so it holds when ipwho.is is throttled,
    // which is exactly what a VPN user often hits.
    let is_vpn = asn
        .as_ref()
        .and_then(|a| a.number)
        .is_some_and(crate::util::geoip::is_hosting_asn);

    // Prefer ipwho.is where it answered: its ISP name is often friendlier than
    // the raw AS org, and taking its whole identity keeps name and ASN
    // consistent.
    Some(IspInfo {
        name: live.and_then(|e| e.name.clone()).or(local_name),
        asn: live.and_then(|e| e.asn.clone()).or(local_asn),
        domain: live.and_then(|e| e.domain.clone()),
        city: live.and_then(|e| e.city.clone()),
        region: live.and_then(|e| e.region.clone()),
        country: live.and_then(|e| e.country.clone()).or(local_country),
        public_ip: Some(public_ip),
        is_vpn,
    })
}

/// Best-effort WAN identity from ipwho.is, a free, keyless HTTPS service. None
/// on no internet, a 5 s timeout, an HTTP error or a throttle.
///
/// One request, about *our own* address. Per-peer lookups never use it: they
/// once exhausted its daily quota within minutes and blanked this card.
async fn ipwho_enrich() -> Option<IspInfo> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .ok()?;
    let response = client.get("https://ipwho.is/").send().await.ok()?;
    // reqwest treats 4xx/5xx as Ok, so a throttle would read as "no data", like
    // being offline. Log it: this card going quiet is the first symptom of a
    // quota problem.
    let status = response.status();
    if !status.is_success() {
        tracing::warn!("ipwho.is ISP lookup returned HTTP {status}");
        return None;
    }
    let body = response.text().await.ok()?;
    let json: serde_json::Value = serde_json::from_str(&body).ok()?;
    // ipwho.is also answers 200 with `{"success": false, "message": ...}` for
    // routine failures, and `message` is what tells a rate limit from a bad
    // lookup.
    if json.get("success").and_then(serde_json::Value::as_bool) == Some(false) {
        let message = json
            .get("message")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("no message");
        tracing::warn!("ipwho.is ISP lookup unsuccessful: {message}");
        return None;
    }

    let str_field = |v: &serde_json::Value, key: &str| {
        v.get(key)
            .and_then(serde_json::Value::as_str)
            .map(str::to_string)
            .filter(|s| !s.is_empty())
    };
    let connection = json.get("connection");
    let name = connection
        .and_then(|c| str_field(c, "isp").or_else(|| str_field(c, "org")));
    let asn = connection
        .and_then(|c| c.get("asn"))
        .and_then(serde_json::Value::as_u64)
        .filter(|&n| n > 0)
        .map(|n| format!("AS{n}"));
    // This one ends up in a URL, not text, so hold it to a hostname's shape.
    // The card percent-encodes it anyway; this keeps junk from becoming an icon
    // request that can only 404.
    let domain = connection.and_then(|c| str_field(c, "domain")).filter(|d| {
        d.len() <= 253
            && d.contains('.')
            && d.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-')
    });

    Some(IspInfo {
        name,
        asn,
        domain,
        city: str_field(&json, "city"),
        region: str_field(&json, "region"),
        country: str_field(&json, "country"),
        public_ip: str_field(&json, "ip"),
        // Never read: `isp_info` decides the VPN verdict on-device.
        is_vpn: false,
    })
}

/// Ten pings to the gateway, or None when there's no default gateway.
async fn gateway_ping(gateway: Option<&str>) -> Option<PingStats> {
    ping(gateway?, 10).await
}

/// Hosts probed only to answer "does this machine have internet?". Independent
/// operators with near-total uptime, so only a real outage of the path fails
/// them all. Probed by *hostname* over full TLS like services
/// ([`crate::util::tls`]), so a captive portal, whose certificate won't
/// validate, reads as no internet rather than a false "online".
const INTERNET_ANCHORS: [&str; 2] = ["cloudflare.com", "www.google.com"];

/// True when any anchor completes its TLS handshake. Anchors run concurrently,
/// so this costs one 5 s timeout at worst, and only when really offline.
pub(crate) async fn internet_reachable() -> bool {
    let probes = INTERNET_ANCHORS.iter().map(|host| handshake_latency(host));
    futures_util::future::join_all(probes)
        .await
        .into_iter()
        .any(|latency| latency.is_some())
}

/// Fold the anchor result and gateway presence into an [`InternetStatus`]. The
/// offline/no-internet split keys on whether a gateway exists, not on gateway
/// ping loss: plenty of routers drop ICMP yet route fine.
pub(crate) fn classify_internet(reachable: bool, gateway: Option<&str>) -> InternetStatus {
    if reachable {
        InternetStatus::Online
    } else if gateway.is_some() {
        InternetStatus::NoInternet
    } else {
        InternetStatus::Offline
    }
}

/// Gateway ping and internet status only, for the Diagnostics view's tight
/// poll. Skips `run`'s ISP and SNMP lookups: an external HTTP call and an SNMP
/// timeout on routers that don't answer, every poll, for data that doesn't
/// change.
pub async fn run_live() -> LiveDiagnostics {
    let gateway = default_gateway().await;
    let (gateway_ping, internet) =
        tokio::join!(gateway_ping(gateway.as_deref()), internet_reachable());
    LiveDiagnostics {
        gateway_ping,
        internet: classify_internet(internet, gateway.as_deref()),
    }
}

/// Internet status and nothing else, for the always-on heartbeat: just the
/// anchor probe and a gateway lookup. Cheap enough to run on a tight timer
/// while hidden to the tray, so a crossing is caught whether or not the window
/// is open.
pub async fn check_internet() -> InternetStatus {
    let gateway = default_gateway().await;
    let reachable = internet_reachable().await;
    classify_internet(reachable, gateway.as_deref())
}

/// The full Diagnostics view report.
pub async fn run() -> NetworkDiagnostics {
    let (gateway, iface, dns) = tokio::join!(default_gateway(), default_interface(), dns_servers());

    // The Router card is named from the gateway's OUI and SNMP, since this view
    // never runs a device scan.
    let local_ipv4 = match &iface {
        Some(name) => crate::connection::interfaces::address_of(name)
            .await
            .0
            .and_then(|ip| ip.parse::<std::net::Ipv4Addr>().ok()),
        None => None,
    };

    // All concurrent. The identity lookup needn't wait out ten pings: SNMP
    // addresses the gateway directly, and its neighbour entry is almost always
    // resolved by the lookups above.
    let (gateway_ping, identity, isp, internet) = tokio::join!(
        gateway_ping(gateway.as_deref()),
        crate::devices::gateway_identity(gateway.as_deref(), local_ipv4),
        isp_info(),
        internet_reachable(),
    );

    NetworkDiagnostics {
        gateway: gateway.clone(),
        default_interface: iface,
        dns_servers: dns,
        gateway_ping,
        internet: classify_internet(internet, gateway.as_deref()),
        gateway_vendor: identity.vendor,
        gateway_model: identity.model,
        gateway_name: identity.name,
        isp,
    }
}
