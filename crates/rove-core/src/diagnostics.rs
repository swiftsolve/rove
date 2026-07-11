use crate::network_info::{default_gateway, default_interface, dns_servers};
use crate::shell::{try_run_timeout};
use crate::types::{
    IspInfo, LiveDiagnostics, NetworkDiagnostics, PingStats, ServiceReachability,
};
use regex_lite::Regex;
use std::sync::LazyLock;

static PING_TIME: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"time[=<]([\d.]+)\s*ms").unwrap());
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio_rustls::rustls::pki_types::ServerName;
use tokio_rustls::rustls::{ClientConfig, RootCertStore};
use tokio_rustls::TlsConnector;

/// Shared client TLS config for the service probe. Trust anchors come from
/// webpki-roots (bundled) and the crypto provider is aws-lc-rs — the same one
/// reqwest already compiles in — selected explicitly so the probe never depends
/// on a process-wide default provider being installed.
static TLS_CONFIG: LazyLock<Arc<ClientConfig>> = LazyLock::new(|| {
    let mut roots = RootCertStore::empty();
    roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    let provider = Arc::new(tokio_rustls::rustls::crypto::aws_lc_rs::default_provider());
    let config = ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .expect("aws-lc-rs supports the default TLS protocol versions")
        .with_root_certificates(roots)
        .with_no_client_auth();
    Arc::new(config)
});

/// Well-known services probed for the reachability card. Ordered as shown in the
/// UI. Each is measured by a full TLS handshake to 443 (see `service_latency`),
/// which works even where the host silently drops ICMP echo (Netflix, Zoom, …)
/// and confirms the secure connection actually completes.
const PROBED_SERVICES: &[(&str, &str)] = &[
    ("Google", "google.com"),
    ("Cloudflare", "cloudflare.com"),
    ("YouTube", "youtube.com"),
    ("Netflix", "netflix.com"),
    ("Zoom", "zoom.us"),
];

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

/// Resolve the WAN-side identity (ISP, ASN, location, public IP) from ipwho.is
/// — a free, keyless, HTTPS geolocation service. Returns None when there's no
/// internet or the lookup fails; the card then falls back to a quieter state.
pub async fn isp_info() -> Option<IspInfo> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .ok()?;
    let body = client
        .get("https://ipwho.is/")
        .send()
        .await
        .ok()?
        .text()
        .await
        .ok()?;
    let json: serde_json::Value = serde_json::from_str(&body).ok()?;
    // ipwho.is answers 200 with `{"success": false, ...}` on lookup failure
    // (rate limit, reserved range) rather than an HTTP error — treat as no data.
    if json.get("success").and_then(serde_json::Value::as_bool) == Some(false) {
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

    Some(IspInfo {
        name,
        asn,
        city: str_field(&json, "city"),
        region: str_field(&json, "region"),
        country: str_field(&json, "country"),
        public_ip: str_field(&json, "ip"),
    })
}

/// Time to establish a *secure* connection to `host:443`, in ms, or None on
/// failure. Covers DNS + TCP + the full TLS handshake (certificate validation
/// included), so — unlike a bare TCP connect — it confirms HTTPS actually works
/// and isn't being intercepted or blocked mid-path. Runs ~1 RTT slower than a
/// plain connect as a result.
async fn service_latency(host: &str) -> Option<f64> {
    let server_name = ServerName::try_from(host).ok()?.to_owned();
    let connector = TlsConnector::from(TLS_CONFIG.clone());
    let start = Instant::now();
    let handshake = async {
        let tcp = tokio::net::TcpStream::connect((host, 443)).await.ok()?;
        connector.connect(server_name, tcp).await.ok()
    };
    let tls = tokio::time::timeout(Duration::from_secs(5), handshake).await.ok()??;
    let ms = start.elapsed().as_secs_f64() * 1000.0;
    drop(tls);
    Some((ms * 10.0).round() / 10.0)
}

/// Probe every service in `PROBED_SERVICES` concurrently.
pub async fn service_reachability() -> Vec<ServiceReachability> {
    let probes = PROBED_SERVICES.iter().map(|&(name, host)| async move {
        ServiceReachability {
            name: name.to_string(),
            host: host.to_string(),
            latency_ms: service_latency(host).await,
        }
    });
    futures_util::future::join_all(probes).await
}

/// Ten pings to the gateway, or None when there's no default gateway.
async fn gateway_ping(gateway: Option<&str>) -> Option<PingStats> {
    match gateway {
        Some(gw) => ping(gw, 10).await,
        None => None,
    }
}

/// The fast-changing metrics only — gateway latency and service reachability —
/// for the Connection view's tight refresh loop. Deliberately skips the ISP and
/// SNMP identity lookups that `run` performs: those never change between polls
/// and re-running them (an external HTTP call and a per-poll SNMP timeout on
/// routers that don't answer) would be wasteful.
pub async fn run_live() -> LiveDiagnostics {
    let gateway = default_gateway().await;
    let (gateway_ping, services) =
        tokio::join!(gateway_ping(gateway.as_deref()), service_reachability());
    LiveDiagnostics { gateway_ping, services }
}

pub async fn run() -> NetworkDiagnostics {
    let (gateway, iface, dns) = tokio::join!(default_gateway(), default_interface(), dns_servers());

    // Resolve the router's make (MAC OUI) and model (SNMP) so the Router panel
    // can name it — the diagnostics view never runs a full device scan itself.
    let local_ipv4 = match &iface {
        Some(name) => crate::interfaces::address_of(name)
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
    // The WAN identity lookup and the service-reachability probes reach the
    // internet, so they join the same concurrent batch — none blocks another.
    let (gateway_ping, identity, isp, services) = tokio::join!(
        gateway_ping(gateway.as_deref()),
        crate::devices::gateway_identity(gateway.as_deref(), local_ipv4),
        isp_info(),
        service_reachability(),
    );

    NetworkDiagnostics {
        gateway,
        default_interface: iface,
        dns_servers: dns,
        gateway_ping,
        gateway_vendor: identity.vendor,
        gateway_model: identity.model,
        isp,
        services,
    }
}
