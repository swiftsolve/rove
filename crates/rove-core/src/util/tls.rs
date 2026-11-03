//! TLS reachability: how long a full handshake to `host:443` takes. Shared by
//! the services probe and the internet-anchor check, so both read "reachable"
//! the same way.
use std::sync::{Arc, LazyLock};
use std::time::{Duration, Instant};
use tokio_rustls::rustls::pki_types::ServerName;
use tokio_rustls::rustls::{ClientConfig, RootCertStore};
use tokio_rustls::TlsConnector;

/// How long a probe waits for the connection before calling the host
/// unreachable.
const PROBE_TIMEOUT: Duration = Duration::from_secs(5);

/// Client config for the probes: bundled webpki-roots, and aws-lc-rs (which
/// reqwest already compiles in) chosen explicitly, so the probe never depends on
/// a process-wide default provider being installed.
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

/// Time to a *secure* connection to `host:443` in ms, or None on failure: DNS,
/// TCP and the full TLS handshake with certificate validation. Unlike a bare
/// TCP connect it confirms HTTPS works and isn't intercepted or blocked
/// mid-path, at the cost of about one extra round trip.
pub async fn handshake_latency(host: &str) -> Option<f64> {
    // An IP literal has no certificate name to validate, so TLS would always
    // fail. A TCP connect still measures reachability, just not HTTPS.
    if host.parse::<std::net::IpAddr>().is_ok() {
        return tcp_connect_latency(host).await;
    }

    let server_name = ServerName::try_from(host).ok()?.to_owned();
    let connector = TlsConnector::from(TLS_CONFIG.clone());
    let start = Instant::now();
    let handshake = async {
        let tcp = tokio::net::TcpStream::connect((host, 443)).await.ok()?;
        connector.connect(server_name, tcp).await.ok()
    };
    let tls = tokio::time::timeout(PROBE_TIMEOUT, handshake).await.ok()??;
    let ms = elapsed_ms(start);
    drop(tls);
    Some(ms)
}

/// Time to open a TCP connection to `host:443` in ms, or None on failure.
async fn tcp_connect_latency(host: &str) -> Option<f64> {
    let start = Instant::now();
    let connect = tokio::net::TcpStream::connect((host, 443));
    let stream = tokio::time::timeout(PROBE_TIMEOUT, connect).await.ok()?.ok()?;
    let ms = elapsed_ms(start);
    drop(stream);
    Some(ms)
}

/// Milliseconds since `start`, to one decimal place.
fn elapsed_ms(start: Instant) -> f64 {
    let ms = start.elapsed().as_secs_f64() * 1000.0;
    (ms * 10.0).round() / 10.0
}
