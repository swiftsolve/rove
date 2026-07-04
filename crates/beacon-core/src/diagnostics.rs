use crate::network_info::{default_gateway, default_interface, dns_servers};
use crate::shell::{try_run_timeout};
use crate::types::{NetworkDiagnostics, PingStats};
use regex_lite::Regex;
use std::time::Duration;

/// Ping a host and derive avg / jitter / loss, like the Electron measurer.
pub async fn ping(host: &str, count: u32) -> Option<PingStats> {
    let cmd = if cfg!(target_os = "windows") {
        format!("ping -n {count} -w 1000 {host}")
    } else {
        format!("ping -c {count} -i 0.2 -W 1 {host} 2>/dev/null")
    };
    let out = try_run_timeout(&cmd, Duration::from_secs(20)).await?;

    let re_time = Regex::new(r"time[=<]([\d.]+)\s*ms").unwrap();
    let times: Vec<f64> = out
        .lines()
        .filter_map(|line| {
            re_time
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

pub async fn run() -> NetworkDiagnostics {
    let (gateway, iface, dns) = tokio::join!(default_gateway(), default_interface(), dns_servers());

    let gateway_ping = match &gateway {
        Some(gw) => ping(gw, 10).await,
        None => None,
    };

    NetworkDiagnostics {
        gateway,
        default_interface: iface,
        dns_servers: dns,
        gateway_ping,
    }
}
