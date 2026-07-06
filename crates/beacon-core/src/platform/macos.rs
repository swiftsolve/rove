//! macOS host/network probes: `ifconfig` and the private `airport` tool.
use crate::shell::try_run;
use crate::types::ConnectionDetails;
use std::collections::HashMap;

pub async fn wifi_details() -> ConnectionDetails {
    let airport = "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport";
    let mut d = ConnectionDetails::default();
    if let Some(out) = try_run(&format!("{airport} -I")).await {
        for line in out.lines() {
            let mut parts = line.trim().splitn(2, ':');
            let key = parts.next().unwrap_or("").trim();
            let value = parts.next().unwrap_or("").trim();
            match key {
                "SSID" => d.ssid = Some(value.to_string()).filter(|s| !s.is_empty()),
                "agrCtlRSSI" => d.signal_dbm = value.parse().ok(),
                "channel" => d.channel = value.split(',').next().and_then(|v| v.trim().parse().ok()),
                _ => {}
            }
        }
    }
    super::finalize_wifi(d)
}

/// Best-effort per-interface oper-state, one `ifconfig` call. Keyed by name,
/// values "up"/"down"; interfaces absent from the map keep their default state.
pub async fn interface_states() -> HashMap<String, String> {
    let mut states = HashMap::new();
    // "en0: flags=8863<UP,...> ... status: active" blocks from ifconfig -a
    if let Some(out) = try_run("ifconfig -a 2>/dev/null").await {
        let mut current = String::new();
        for line in out.lines() {
            if !line.starts_with(char::is_whitespace) {
                current = line.split(':').next().unwrap_or("").to_string();
            } else if let Some(status) = line.trim().strip_prefix("status: ") {
                let state = if status.trim() == "active" { "up" } else { "down" };
                states.insert(current.clone(), state.to_string());
            }
        }
    }
    states
}
