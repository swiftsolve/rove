//! Reachability of the user's service list (Google, Netflix, …): each service's
//! TLS latency and HTTP health, paired with whether this machine had internet.
use crate::diagnostics::{self, InternetStatus};
use crate::util::tls::handshake_latency;
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// One service in the user's reachability list: the stored definition, without a
/// measurement. Mirrors `ServiceDefinition` in `src/types/diagnostics.ts`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceDef {
    pub name: String,
    pub host: String,
}

/// The reachability services shipped by default. Seeded into the `services`
/// table on first creation; users add to or remove from the list thereafter.
pub const DEFAULT_SERVICES: &[(&str, &str)] = &[
    ("Google", "google.com"),
    ("Cloudflare", "cloudflare.com"),
    ("YouTube", "youtube.com"),
    ("Netflix", "netflix.com"),
    ("Zoom", "zoom.us"),
];

/// The defaults as owned `ServiceDef`s: the fallback when the store can't be
/// read, so the Services view never blanks on a transient database error.
pub fn default_service_list() -> Vec<ServiceDef> {
    DEFAULT_SERVICES
        .iter()
        .map(|&(name, host)| ServiceDef { name: name.to_string(), host: host.to_string() })
        .collect()
}

/// Service reachability plus this machine's internet verdict, probed as one
/// batch. Pairing them is what lets the Services view tell a real outage from
/// this machine being offline: then every probe fails at once, and the view
/// shows one "connection lost" instead of a wall of per-service downs.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServicesReport {
    /// Public-internet reachability, from the same batch as `services`.
    pub internet: InternetStatus,
    /// One entry per service in the user's list, in list order.
    pub services: Vec<ServiceReachability>,
}

/// Reachability of one service on two independent axes: the network path
/// (`latency_ms`, a TLS handshake to :443, since many of these block ICMP) and
/// the application (`http_status`, from a HEAD). They can disagree: a Cloudflare
/// tunnel failure (Error 1033) completes TLS at the edge in a few ms but returns
/// HTTP 530.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceReachability {
    /// Human label, e.g. "Netflix".
    pub name: String,
    /// Host probed, e.g. "netflix.com".
    pub host: String,
    /// TLS handshake time to :443 in ms (a TCP connect for an IP literal), or
    /// None when it failed or timed out.
    pub latency_ms: Option<f64>,
    /// HTTP status from a HEAD to `https://host/`, or None for an IP literal or
    /// when no response came back. A 5xx means the path is up but the service
    /// is erroring.
    pub http_status: Option<u16>,
}

/// The status a service was in at a point in time.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ServiceStatus {
    Up,
    Down,
}

/// This machine's own network dropping or returning, as the services timeline
/// records it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionChange {
    Lost,
    Restored,
}

/// One entry in the services timeline. Only changes are stored, never a sample
/// per probe, so the log stays small and reads as a history of outages and
/// recoveries.
///
/// `Connection` exists because when *this machine* loses its network, every
/// probe fails at once. That isn't the services' outage, so the log records one
/// connection drop instead of a wall of per-service downs, and per-service
/// diffing pauses until the network returns.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ServiceEvent {
    /// A single service crossed between up and down.
    Transition {
        /// Host probed: the stable key across renames.
        host: String,
        /// The service's label as it read when the crossing was recorded.
        name: String,
        /// The status it moved *into*.
        status: ServiceStatus,
        ts: i64,
    },
    /// `count` of `total` tracked services were up. Logged once as a baseline
    /// when monitoring first sees the services, and again whenever everything
    /// recovers. A recovery is always `count == total`, but a baseline can be
    /// partial (a service may already be down the first time we look).
    Running { count: i64, total: i64, ts: i64 },
    /// This machine's own connection dropped or returned.
    Connection { status: ConnectionChange, ts: i64 },
}

/// The status a HEAD to `https://host/` returns, or None when there's no usable
/// answer. The application-layer counterpart to [`handshake_latency`]; see
/// [`ServiceReachability`] for why the two can disagree.
async fn service_health(host: &str) -> Option<u16> {
    // An IP literal has no certificate name and no virtual host to route on, so
    // an HTTP probe would be meaningless or hit an unrelated default vhost.
    if host.parse::<std::net::IpAddr>().is_ok() {
        return None;
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        // Don't chase redirects: a 3xx already proves the server is answering,
        // and following it would add round-trips and blur which host we rated.
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .ok()?;
    let resp = client.head(format!("https://{host}/")).send().await.ok()?;
    Some(resp.status().as_u16())
}

/// Latency in ms when `host` is up, or None when the path failed or the host
/// answered with a 5xx. Backs "test before add", so it judges on both axes like
/// the Services list does: the dialog must agree with the list the service will
/// land in.
pub async fn probe_service(host: &str) -> Option<f64> {
    let (latency, health) = tokio::join!(handshake_latency(host), service_health(host));
    // An IP literal has no HTTP check (`service_health` is None), so its latency
    // alone decides.
    let latency = latency?;
    if health.is_some_and(|status| status >= 500) {
        return None;
    }
    Some(latency)
}

/// Probe every service concurrently on both axes, keeping list order, so one
/// that's reachable but erroring doesn't read as a clean green latency.
pub async fn service_reachability(services: &[ServiceDef]) -> Vec<ServiceReachability> {
    let probes = services.iter().map(|svc| async move {
        let (latency_ms, http_status) =
            tokio::join!(handshake_latency(&svc.host), service_health(&svc.host));
        ServiceReachability {
            name: svc.name.clone(),
            host: svc.host.clone(),
            latency_ms,
            http_status,
        }
    });
    futures_util::future::join_all(probes).await
}

/// The Services view's probe: every service plus this machine's internet
/// verdict from the same batch (see [`ServicesReport`]). The gateway lookup only
/// lets `classify_internet` tell "WAN down" (still on a LAN) from "no network".
pub async fn run_services(service_list: &[ServiceDef]) -> ServicesReport {
    let gateway = crate::connection::default_gateway().await;
    let (internet, services) =
        tokio::join!(diagnostics::internet_reachable(), service_reachability(service_list));
    ServicesReport {
        internet: diagnostics::classify_internet(internet, gateway.as_deref()),
        services,
    }
}
