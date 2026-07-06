use crate::network_info::{default_gateway, default_interface, dns_servers};
use crate::shell::{try_run_timeout};
use crate::types::{NetworkDiagnostics, PingStats};
use regex_lite::Regex;
use std::sync::LazyLock;

static PING_TIME: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"time[=<]([\d.]+)\s*ms").unwrap());
use std::time::Duration;

/// Ping a host and derive avg / jitter / loss, like the Electron measurer.
pub async fn ping(host: &str, count: u32) -> Option<PingStats> {
    // `host` is interpolated into a shell command; callers pass gateway/DNS
    // addresses from the kernel, but validate defensively all the same.
    if !crate::net_util::is_shell_safe_ip(host) {
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
