//! Serde mirrors of shared/types/*.ts — field names must stay camelCase
//! so the existing React frontend consumes them unchanged.
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionDetails {
    pub ssid: Option<String>,
    pub signal_strength: Option<i64>,
    pub signal_dbm: Option<i64>,
    pub frequency: Option<i64>,
    pub channel: Option<i64>,
    pub security: Option<String>,
    pub wifi_standard: Option<String>,
    pub link_speed_mbps: Option<i64>,
    pub duplex: Option<String>,
    pub vendor: Option<String>,
    pub product: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkInfo {
    pub connection_type: String, // "wifi" | "ethernet" | "disconnected"
    pub is_connected: bool,
    pub interface_name: Option<String>,
    pub ip_address: Option<String>,
    pub gateway: Option<String>,
    pub mac_address: Option<String>,
    pub dns: Vec<String>,
    #[serde(flatten)]
    pub details: ConnectionDetails,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InterfaceSummary {
    pub name: String,
    pub connection_type: String,
    pub oper_state: String,
    pub ip_address: Option<String>,
    pub mac_address: Option<String>,
    pub speed_mbps: Option<i64>,
    pub is_default: bool,
    pub is_virtual: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanDevice {
    pub ip: String,
    pub mac: String,
    pub vendor: Option<String>,
    pub hostname: Option<String>,
    /// Hardware model from mDNS TXT or a UPnP description, e.g. "MacBookPro18,3"
    /// or "BRAVIA KD-55X". None when no source reported one.
    pub model: Option<String>,
    /// OS family from the passive DHCP fingerprint (e.g. "Android", "Windows",
    /// "Apple"). None when unknown.
    pub os: Option<String>,
    pub kind: String,
    /// "high" when the classifier's verdict was decisive, "low" when it's a
    /// thin-margin best guess the UI hedges (e.g. "Phone?").
    pub kind_confidence: &'static str,
    pub is_randomized_mac: bool,
    pub is_gateway: bool,
    pub is_self: bool,
    pub reachable: bool,
    /// Epoch-ms this device last answered, carried so the UI can show "last seen
    /// 3m ago" for an offline device. `None` on a freshly-scanned device that
    /// hasn't been merged against the roster yet; the store's merge stamps it.
    pub last_seen: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanDeviceScan {
    pub devices: Vec<LanDevice>,
    pub subnet: Option<String>,
    pub interface_name: Option<String>,
    pub scanned_at: u64,
    /// Passive DHCP fingerprinting state: "starting", "active", or
    /// "unavailable" (no privilege to bind :67).
    pub dhcp_status: &'static str,
}

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
    /// brand icon. Comes free with the lookup that fills the rest of this struct.
    pub domain: Option<String>,
    pub city: Option<String>,
    pub region: Option<String>,
    pub country: Option<String>,
    /// Public (WAN) IP as reported by the same lookup, so the card needn't make
    /// a second round-trip to the plain public-IP echo service.
    pub public_ip: Option<String>,
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedResult {
    pub download_mbps: f64,
    pub upload_mbps: f64,
    pub latency_ms: f64,
    pub jitter_ms: f64,
    pub packet_loss: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityRating {
    pub id: String,
    pub label: String,
    pub description: String,
    pub icon: String,
    pub level: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedTestResult {
    pub internet: SpeedResult,
    pub capabilities: Vec<CapabilityRating>,
    pub link_capacity_mbps: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedTestProgress {
    pub phase: String,
    pub message: String,
    pub progress: u8,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveThroughput {
    pub download_mbps: f64,
    pub upload_mbps: f64,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyUsage {
    pub date: String,
    pub rx_bytes: u64,
    pub tx_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataUsageSummary {
    pub days: Vec<DailyUsage>,
    pub boot_rx_bytes: u64,
    pub boot_tx_bytes: u64,
    pub tracking_since: Option<u64>,
}

/// One application's network usage since Rove started watching. `name` is the
/// process name (all processes sharing it are summed).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUsage {
    pub name: String,
    pub rx_bytes: u64,
    pub tx_bytes: u64,
    /// A `data:image/png;base64,…` of the app's real OS icon (macOS), or `None`
    /// when it couldn't be resolved (helpers/daemons, or a non-macOS platform) —
    /// the UI then falls back to a favicon/monogram.
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUsageSummary {
    /// Per-app totals, busiest first. Empty before the first sample.
    pub apps: Vec<AppUsage>,
    /// `"supported"` where per-app metering works (Linux, macOS) or
    /// `"unsupported"` where it needs a facility Rove doesn't yet drive
    /// (Windows/ETW) — the UI shows an explanatory note instead of an empty list.
    pub support: &'static str,
    /// Epoch ms of the first sample, or null before then.
    pub tracking_since: Option<u64>,
}

/// One remote host an app has exchanged bytes with this session. `ip` is the
/// grouping key (all connections to the same peer are summed); `host` and
/// `country_code` are filled in asynchronously after the peer is first seen, so
/// both are `None` until reverse-DNS / geolocation resolve (or if they fail).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostConn {
    /// Remote peer IP (no port). Stable identity for the host across samples.
    pub ip: String,
    /// Reverse-DNS hostname, or `None` until resolved / when it has no PTR.
    pub host: Option<String>,
    /// ISO-3166 alpha-2 country code (e.g. "US"), or `None` until resolved,
    /// for a private/reserved address, or when the geolocation lookup fails.
    pub country_code: Option<String>,
    pub rx_bytes: u64,
    pub tx_bytes: u64,
}

/// One application with the remote hosts it has talked to, busiest host first.
/// The app-level `rx_bytes`/`tx_bytes` are the sum across its hosts — note this
/// is TCP-connection traffic only (the source that carries a peer address), so
/// it can read a little lower than the Apps view's all-protocol process totals.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppHosts {
    pub name: String,
    /// The app's real OS icon as a `data:` URI, or `None` (see [`AppUsage::icon`]).
    pub icon: Option<String>,
    pub rx_bytes: u64,
    pub tx_bytes: u64,
    pub hosts: Vec<HostConn>,
}

/// Per-app remote-host breakdown for the Hosts view. Mirrors
/// [`AppUsageSummary`]'s shape (apps busiest first, platform `support`, and the
/// tracking-since epoch) so the frontend can treat the two the same way.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostUsageSummary {
    pub apps: Vec<AppHosts>,
    /// `"supported"` where per-host attribution works (Linux, macOS) or
    /// `"unsupported"` elsewhere (Windows ETW carries no peer address).
    pub support: &'static str,
    pub tracking_since: Option<u64>,
}
