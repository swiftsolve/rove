//! Reachability of the user's service list (Google, Netflix, …): each service's
//! TLS latency and HTTP health, paired with whether this machine had internet.
use crate::diagnostics::{self, InternetStatus};
use crate::util::tls::handshake_latency;
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// One service in the user's reachability list — the durable definition, without
/// a measurement. Ships with defaults but is editable per user. camelCase on the
/// wire to match the React `ServiceDefinition`.
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

/// The defaults as owned `ServiceDef`s — the fallback a diagnostics run uses if
/// the store can't be read, so the card never blanks on a transient DB error.
pub fn default_service_list() -> Vec<ServiceDef> {
    DEFAULT_SERVICES
        .iter()
        .map(|&(name, host)| ServiceDef { name: name.to_string(), host: host.to_string() })
        .collect()
}

/// Service reachability plus the internet context needed to read it, probed as
/// one batch and served by its own command — the Connection diagnostics no
/// longer probe services (that's the Services view's own concern). Pairing the
/// two atomically is what lets the Services view tell a genuine outage apart
/// from this machine simply being offline: when the machine has no internet,
/// every probe fails at once and the view collapses that to a single
/// "connection lost" rather than a wall of per-service downs.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServicesReport {
    /// Public-internet reachability, from the same batch as `services`.
    pub internet: InternetStatus,
    /// TCP-connect reachability of the user's service list. Empty only if the
    /// list is somehow cleared; each entry may still be Unreachable.
    pub services: Vec<ServiceReachability>,
}

/// Reachability of one internet service, along two independent axes: a network
/// signal (`latency_ms`, the time to complete a TLS handshake to :443 — many of
/// these block ICMP echo) and an application signal (`http_status`, what a
/// lightweight HTTP HEAD actually returns). They can disagree: a service can be
/// reachable in a few ms yet answering 5xx, e.g. a Cloudflare tunnel failure
/// (Error 1033) whose edge TLS completes fine but returns HTTP 530.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceReachability {
    /// Human label, e.g. "Netflix".
    pub name: String,
    /// Hostname probed, e.g. "netflix.com".
    pub host: String,
    /// TLS-handshake latency to :443 in ms, or None when it failed/timed out.
    pub latency_ms: Option<f64>,
    /// HTTP status from a HEAD to `https://host/`, or None for IP-literal hosts
    /// and when no HTTP response came back. A 5xx here means the network path is
    /// up but the service itself is erroring.
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

/// One entry in the services timeline. Only moments are stored — never a sample
/// per probe — so the log stays small and reads as a history of outages and
/// recoveries rather than a firehose.
///
/// A `Connection` event exists because when *this machine* loses its network,
/// every probe fails at once. That isn't an outage of theirs, so the log records
/// a single connection drop in place of the wall of per-service downs, and
/// freezes per-service diffing until the network returns.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ServiceEvent {
    /// A single service crossed between up and down.
    Transition {
        /// Hostname probed — the stable key across renames.
        host: String,
        /// The service's label as it read when the crossing was recorded.
        name: String,
        /// The status it moved *into*.
        status: ServiceStatus,
        ts: i64,
    },
    /// A summary of the tracked services: `count` of `total` were up. Logged
    /// once as a baseline when monitoring first sees the services, and again
    /// whenever everything recovers after an outage. A recovery is always
    /// `count == total`, but a baseline can be partial — a service may already
    /// have been down the first time we looked — so the two must stay distinct.
    Running { count: i64, total: i64, ts: i64 },
    /// This machine's own connection dropped or returned.
    Connection { status: ConnectionChange, ts: i64 },
}

/// The HTTP status a lightweight HEAD to `https://host/` returns, or None when
/// there's no usable HTTP answer (IP-literal host, or the request failed/timed
/// out). This is the application-layer counterpart to [`handshake_latency`]: the
/// two can disagree, and that's the point — a 5xx here on a service that
/// `handshake_latency` reaches in a few ms means the network path is fine but the
/// service itself is failing. A Cloudflare tunnel error (Error 1033) is exactly
/// this shape: TLS to the edge completes, but the edge returns HTTP 530.
async fn service_health(host: &str) -> Option<u16> {
    // An IP literal has no certificate name and no virtual host to route on, so
    // an HTTP probe would be meaningless (or hit an unrelated default vhost).
    // The reachability latency alone stands in for it, as it does in
    // `handshake_latency`.
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

/// Reachability of a single host, measured on both axes — the TLS handshake (or
/// an IP's TCP connect) *and* the HTTP health — so its verdict matches what the
/// Services list shows. Returns the latency in ms when the service is up, or None
/// when it's Down: either the network path failed, or the host answered but with
/// a server error (a Cloudflare tunnel that's down returns HTTP 530, for
/// instance). Used by the "test before add" step so a service can be checked
/// without being stored — the dialog must agree with the list it will land in.
pub async fn probe_service(host: &str) -> Option<f64> {
    let (latency, health) = tokio::join!(handshake_latency(host), service_health(host));
    // The path has to be reachable at all (TLS/TCP), and — for hostnames, where
    // an HTTP probe is meaningful — the service must not be answering a 5xx. An
    // IP literal has no HTTP check (`service_health` is None), so latency stands.
    let latency = latency?;
    if health.is_some_and(|status| status >= 500) {
        return None;
    }
    Some(latency)
}

/// Probe each service in `services` concurrently, preserving their order. Each
/// service is measured on both axes — network latency (TLS handshake) and HTTP
/// health (HEAD) — at once, so a service that's reachable but erroring reads as
/// such rather than as a clean green latency.
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

/// Service reachability, on its own — the Services view's probe, independent of
/// the Connection diagnostics above. Bundles the machine's own internet verdict,
/// probed in the same batch, so the view can pair each set of service results
/// with whether *we* had internet when they were taken (see [`ServicesReport`]).
/// The gateway lookup is only what `classify_internet` needs to tell "WAN down"
/// (on a LAN) apart from "no network at all".
pub async fn run_services(service_list: &[ServiceDef]) -> ServicesReport {
    let gateway = crate::connection::default_gateway().await;
    let (internet, services) =
        tokio::join!(diagnostics::internet_reachable(), service_reachability(service_list));
    ServicesReport {
        internet: diagnostics::classify_internet(internet, gateway.as_deref()),
        services,
    }
}
