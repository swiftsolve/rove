//! TLS reachability: how long a full handshake to `host:443` takes. Shared by
//! the services probe and the internet-anchor check, so both read "reachable"
//! the same way.
use std::sync::{Arc, LazyLock};
use std::time::{Duration, Instant};
use tokio_rustls::rustls::pki_types::ServerName;
use tokio_rustls::rustls::{ClientConfig, RootCertStore};
use tokio_rustls::TlsConnector;

/// Shared client TLS config for the TLS reachability probes. Trust anchors come from
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

/// Time to establish a *secure* connection to `host:443`, in ms, or None on
/// failure. Covers DNS + TCP + the full TLS handshake (certificate validation
/// included), so — unlike a bare TCP connect — it confirms HTTPS actually works
/// and isn't being intercepted or blocked mid-path. Runs ~1 RTT slower than a
/// plain connect as a result.
pub async fn handshake_latency(host: &str) -> Option<f64> {
    // A bare IP literal has no certificate name to validate against, so the TLS
    // probe below would spuriously read "unreachable". Fall back to a plain TCP
    // connect to :443, which still measures reachability — it just can't assert
    // that HTTPS specifically completes the way the hostname path does.
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
    let tls = tokio::time::timeout(Duration::from_secs(5), handshake).await.ok()??;
    let ms = start.elapsed().as_secs_f64() * 1000.0;
    drop(tls);
    Some((ms * 10.0).round() / 10.0)
}

/// Time to open a plain TCP connection to `host:443`, in ms, or None on failure.
/// Used for IP-literal services, where there's no hostname for a TLS cert check.
async fn tcp_connect_latency(host: &str) -> Option<f64> {
    let start = Instant::now();
    let connect = tokio::net::TcpStream::connect((host, 443));
    let stream = tokio::time::timeout(Duration::from_secs(5), connect).await.ok()?.ok()?;
    let ms = start.elapsed().as_secs_f64() * 1000.0;
    drop(stream);
    Some((ms * 10.0).round() / 10.0)
}
