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
    pub is_randomized_mac: bool,
    pub is_gateway: bool,
    pub is_self: bool,
    pub reachable: bool,
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkDiagnostics {
    pub gateway: Option<String>,
    pub default_interface: Option<String>,
    pub dns_servers: Vec<String>,
    pub gateway_ping: Option<PingStats>,
    /// Router make from the gateway's MAC OUI, or None when unknown/randomized.
    pub gateway_vendor: Option<String>,
    /// Router model from the gateway's SNMP `sysDescr`, or None when it doesn't
    /// answer SNMP (many consumer routers) or reports no usable model.
    pub gateway_model: Option<String>,
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
