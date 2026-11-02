use crate::connection::{default_gateway, default_interface, dns_servers};
use crate::util::shell::{try_run_timeout};
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

/// Whether this machine can actually reach the public internet — the context a
/// service verdict needs to mean anything. A service that doesn't answer reads as
/// "Down" only when we know the internet is up; otherwise the failure is ours,
/// not the service's, and the UI must say "can't check" instead of blaming it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum InternetStatus {
    /// An internet anchor was reachable — service verdicts are trustworthy.
    Online,
    /// A default gateway exists (we're on a LAN) but no anchor answered — the WAN
    /// is down. LAN-local services may still be reachable; public ones can't be.
    NoInternet,
    /// No default gateway at all — not on a usable network. Nothing is reachable.
    Offline,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkDiagnostics {
    pub gateway: Option<String>,
    pub default_interface: Option<String>,
    pub dns_servers: Vec<String>,
    pub gateway_ping: Option<PingStats>,
    /// Public-internet reachability, so the Services list can tell a genuine
    /// outage apart from this machine simply being offline.
    pub internet: InternetStatus,
    /// Router make from the gateway's MAC OUI, or None when unknown/randomized.
    pub gateway_vendor: Option<String>,
    /// Router model from the gateway's SNMP `sysDescr` (or UPnP `modelName`), or
    /// None when it answers neither or reports no usable model.
    pub gateway_model: Option<String>,
    /// Router product name from the gateway's UPnP `friendlyName` (e.g. "Giga Hub
    /// 2.0"), or None when it doesn't announce over SSDP.
    pub gateway_name: Option<String>,
    /// WAN-side identity (ISP, ASN, location, public IP), or None when the
    /// lookup service is unreachable — e.g. no internet or the request timed out.
    pub isp: Option<IspInfo>,
}

/// WAN-side identity resolved from an IP-geolocation lookup. Every field is
/// optional because the provider may omit any of them for a given address.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IspInfo {
    /// The ISP or organization name (e.g. "Comcast Cable").
    pub name: Option<String>,
    /// Autonomous-system number, formatted "AS15169".
    pub asn: Option<String>,
    /// The ISP's registered domain (e.g. "bell.ca") — the card resolves it to a
    /// brand icon. Only the live ipwho.is enrichment carries this; it's absent
    /// (and the icon falls away) when that lookup is rate-limited or down.
    pub domain: Option<String>,
    /// City and region are likewise enrichment-only. Country is also resolved
    /// on-device, so the Location row keeps at least a country when ipwho.is is
    /// unavailable.
    pub city: Option<String>,
    pub region: Option<String>,
    pub country: Option<String>,
    /// Public (WAN) IP, from the quota-free echo service that anchors the
    /// on-device lookups — so the card needn't trust the enrichment lookup for
    /// its most basic field.
    pub public_ip: Option<String>,
    /// True when our public IP's ASN is a datacenter/hosting network rather than
    /// a consumer ISP — i.e. we're behind a VPN or proxy, so the fields above
    /// describe the exit node, not the real provider. The card badges itself
    /// accordingly. Resolved on-device ([`crate::util::geoip::is_hosting_asn`]), so it
    /// holds even when the live enrichment lookup is rate-limited.
    pub is_vpn: bool,
}

/// The fast-changing subset of diagnostics, refreshed on a tight poll so the
/// Connection view's live numbers stay current without re-running the heavier
/// ISP geolocation and SNMP router-identity lookups (which never change between
/// polls). Merged over the last full [`NetworkDiagnostics`] on the frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveDiagnostics {
    pub gateway_ping: Option<PingStats>,
    /// Public-internet reachability, refreshed each poll. See [`InternetStatus`].
    pub internet: InternetStatus,
}

static PING_TIME: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"time[=<]([\d.]+)\s*ms").unwrap());

/// Ping a host and derive avg / jitter / loss, like the Electron measurer.
pub async fn ping(host: &str, count: u32) -> Option<PingStats> {
    // `host` is interpolated into a shell command; callers pass gateway/DNS
    // addresses from the kernel, but validate defensively all the same.
    if !crate::util::net::is_shell_safe_ip(host) {
        return None;
    }
    let cmd = crate::platform::ping_command(host, count, 1000);
    let out = try_run_timeout(&cmd, Duration::from_secs(20)).await?;

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
        return Some(PingStats { avg_ms: 9999.0, jitter_ms: 9999.0, packet_loss: 100.0 });
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

/// The WAN-side identity for the ISP card: ISP name, ASN, location, and public
/// IP. Assembled from two sources so the card stays populated whenever we're
/// online:
///
///   * **On-device** ([`crate::util::geoip`]) — ASN (number + operator name) and
///     country, resolved from our public IP against the bundled DB-IP tables.
///     No network, no quota, so this base is always available.
///   * **Live enrichment** ([`ipwho_enrich`]) — Website (the card's brand icon)
///     and city, plus a friendlier ISP name, layered on top *when* ipwho.is
///     answers. Best-effort: its rate limit or an outage costs only these
///     extras, no longer the whole card.
///
/// `None` only when we can't even learn our own public IP — i.e. we're offline —
/// which is the one case where the card's quiet state is the right answer.
pub async fn isp_info() -> Option<IspInfo> {
    // Our public IP and the enrichment lookup are independent — ipwho.is resolves
    // *our* address server-side, needing nothing from us — and both hit the
    // network, so they run concurrently. The IP comes from the plain echo service
    // (no quota); it anchors the on-device lookups and stands in for ipwho.is
    // when that's throttled.
    let (public_ip, enrich) = tokio::join!(crate::connection::public_ip(), ipwho_enrich());

    // Whichever source named our address, ipify preferred as the quota-free
    // anchor. Nothing at all means offline: give up and let the card go quiet.
    let public_ip = public_ip.or_else(|| enrich.as_ref().and_then(|e| e.public_ip.clone()))?;

    // On-device base: ASN identity and country, from the bundled tables.
    let asn = crate::util::geoip::asn_info(&public_ip);
    let local_name = asn.as_ref().and_then(|a| a.org.clone());
    let local_asn = asn.as_ref().and_then(|a| a.number).map(|n| format!("AS{n}"));
    let local_country = crate::util::geoip::country_name(&public_ip);

    // A hosting/datacenter ASN for our own egress means a VPN or proxy, not a
    // consumer ISP — decided from the locally-resolved AS number so it holds even
    // when ipwho.is is throttled (the exact case a VPN'd user often hits).
    let is_vpn = asn
        .as_ref()
        .and_then(|a| a.number)
        .is_some_and(crate::util::geoip::is_hosting_asn);

    // Merge, preferring ipwho.is's strings where it answered — its ISP name is
    // often friendlier than the raw AS org, and it owns the whole identity so
    // name/ASN stay mutually consistent. Domain, city, and region have no local
    // source, so they're simply absent when ipwho.is is unavailable.
    let e = enrich.as_ref();
    Some(IspInfo {
        name: e.and_then(|e| e.name.clone()).or(local_name),
        asn: e.and_then(|e| e.asn.clone()).or(local_asn),
        domain: e.and_then(|e| e.domain.clone()),
        city: e.and_then(|e| e.city.clone()),
        region: e.and_then(|e| e.region.clone()),
        country: e.and_then(|e| e.country.clone()).or(local_country),
        public_ip: Some(public_ip),
        is_vpn,
    })
}

/// Best-effort WAN identity from ipwho.is — a free, keyless, HTTPS geolocation
/// service. Returns None when there's no internet or the lookup fails (a 5s
/// timeout, an HTTP error, or a throttle), in which case [`isp_info`] falls back
/// to the on-device tables for everything but Website and city.
///
/// This is the only lookup that still leaves the machine, and it's one request
/// about *our own* address. Per-peer flags used to share this service and could
/// exhaust its free daily quota within minutes of churn, which silently blanked
/// this card too; they're resolved locally now, as — since this rewrite — are
/// the card's own ISP name, ASN, and country.
async fn ipwho_enrich() -> Option<IspInfo> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .ok()?;
    let response = client.get("https://ipwho.is/").send().await.ok()?;
    // reqwest treats 4xx/5xx as Ok, so a throttled or errored lookup would sail
    // through to the parse below and read as "no data" — indistinguishable from
    // being offline. Name it in the log instead: this card going quiet is the
    // first symptom of a quota problem, and it used to be undiagnosable.
    let status = response.status();
    if !status.is_success() {
        tracing::warn!("ipwho.is ISP lookup returned HTTP {status}");
        return None;
    }
    let body = response.text().await.ok()?;
    let json: serde_json::Value = serde_json::from_str(&body).ok()?;
    // ipwho.is also answers 200 with `{"success": false, "message": ...}` for
    // failures it considers routine (verified against a malformed address), so
    // the status check alone isn't enough — and `message` is what distinguishes
    // a rate limit from a bad lookup.
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
    // Unlike the other fields, this one ends up inside a URL rather than being
    // rendered as text, so it's held to a hostname's shape instead of passing a
    // third party's string through. The card percent-encodes it regardless —
    // this just keeps junk from becoming an icon request that can only 404.
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
        // Enrichment only; the VPN verdict is decided on-device in `isp_info`
        // from the resolved ASN, so this field of the enrichment is never read.
        is_vpn: false,
    })
}

/// Ten pings to the gateway, or None when there's no default gateway.
async fn gateway_ping(gateway: Option<&str>) -> Option<PingStats> {
    match gateway {
        Some(gw) => ping(gw, 10).await,
        None => None,
    }
}

/// Hosts probed solely to answer "does this machine have working internet?".
/// Independent operators with near-100% uptime, so it takes a real outage of the
/// whole path — not one flaky service — for every one to fail. Probed by
/// *hostname* through the same full-TLS path as services ([`crate::util::tls`]),
/// so a captive portal (whose certificate won't validate) reads as no-internet
/// rather than a false "online".
const INTERNET_ANCHORS: [&str; 2] = ["cloudflare.com", "www.google.com"];

/// Whether this machine can currently reach the public internet — true as soon as
/// any one anchor completes its TLS handshake. This is the context a failed
/// service probe needs: without it, "unreachable from here" is indistinguishable
/// from "the service is down". Anchors run concurrently, so this costs one 5s
/// timeout at worst (only when the machine really is offline).
pub(crate) async fn internet_reachable() -> bool {
    let probes = INTERNET_ANCHORS.iter().map(|host| handshake_latency(host));
    futures_util::future::join_all(probes)
        .await
        .into_iter()
        .any(|latency| latency.is_some())
}

/// Fold the anchor result and gateway presence into an [`InternetStatus`]. We key
/// the offline/no-internet split on whether a gateway exists — a route to a LAN —
/// rather than on gateway ping loss, because plenty of routers drop ICMP echo yet
/// route fine; treating that as "offline" would be wrong.
pub(crate) fn classify_internet(reachable: bool, gateway: Option<&str>) -> InternetStatus {
    if reachable {
        InternetStatus::Online
    } else if gateway.is_some() {
        InternetStatus::NoInternet
    } else {
        InternetStatus::Offline
    }
}

/// The fast-changing metrics only — gateway latency and service reachability —
/// for the Connection view's tight refresh loop. Deliberately skips the ISP and
/// SNMP identity lookups that `run` performs: those never change between polls
/// and re-running them (an external HTTP call and a per-poll SNMP timeout on
/// routers that don't answer) would be wasteful.
pub async fn run_live() -> LiveDiagnostics {
    let gateway = default_gateway().await;
    let (gateway_ping, internet) =
        tokio::join!(gateway_ping(gateway.as_deref()), internet_reachable());
    LiveDiagnostics {
        gateway_ping,
        internet: classify_internet(internet, gateway.as_deref()),
    }
}

/// Public-internet reachability, and nothing else. The always-on background
/// heartbeat calls this: it deliberately skips the gateway ping, the service
/// list, and the ISP/SNMP identity that `run`/`run_live` gather — just the
/// anchor probe plus a gateway lookup, folded into an [`InternetStatus`]. That
/// keeps it cheap enough to run on a tight timer (and while the window is hidden
/// to tray), so an internet up/down transition is caught no matter which tab is
/// open — or whether the window is open at all.
pub async fn check_internet() -> InternetStatus {
    let gateway = default_gateway().await;
    let reachable = internet_reachable().await;
    classify_internet(reachable, gateway.as_deref())
}

pub async fn run() -> NetworkDiagnostics {
    let (gateway, iface, dns) = tokio::join!(default_gateway(), default_interface(), dns_servers());

    // Resolve the router's make (MAC OUI) and model (SNMP) so the Router panel
    // can name it — the diagnostics view never runs a full device scan itself.
    let local_ipv4 = match &iface {
        Some(name) => crate::connection::interfaces::address_of(name)
            .await
            .0
            .and_then(|ip| ip.parse::<std::net::Ipv4Addr>().ok()),
        None => None,
    };

    // Ping and identity lookup run concurrently rather than back-to-back: SNMP
    // addresses the gateway directly, and its neighbor-table entry is virtually
    // always already resolved from the gateway/interface lookups above, so the
    // MAC read no longer needs to wait out ten pings first.
    //
    // The WAN identity lookup and the internet-anchor probe both reach the
    // internet, so they join the same concurrent batch — none blocks another.
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
