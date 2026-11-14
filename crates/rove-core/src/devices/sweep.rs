//! ICMP sweep: ping every host in the subnet so idle devices enter the neighbor
//! table. The ARP exchange each ping triggers registers a device even when it
//! drops ICMP.
use futures_util::StreamExt;
use std::collections::HashSet;
use std::net::Ipv4Addr;
use std::time::Duration;

const CONCURRENT_PROBES: usize = 64;
/// One echo request per host, waiting this long for the reply. A LAN host
/// answers in single-digit ms, and the ARP exchange the ping triggers is what
/// discovery needs.
const PING_WAIT_MS: u32 = 700;
/// Kills a `ping` process that hangs past its own wait.
const PING_PROCESS_TIMEOUT: Duration = Duration::from_secs(3);

/// Ping every host in the subnet and return the IPs that replied. `ping` exits
/// non-zero without a reply, so `Some` is a positive liveness signal: the scan
/// uses it to tell a device answering now from one lingering in the ARP cache.
pub async fn sweep(subnet: &str) -> HashSet<Ipv4Addr> {
    let Some(hosts) = super::subnet::hosts(subnet) else {
        return HashSet::new();
    };

    futures_util::stream::iter(hosts)
        .map(|ip| async move {
            let cmd = crate::platform::ping_command(&ip.to_string(), 1, PING_WAIT_MS);
            let replied = crate::utils::shell::try_run_timeout(&cmd, PING_PROCESS_TIMEOUT).await.is_some();
            replied.then_some(ip)
        })
        .buffer_unordered(CONCURRENT_PROBES)
        .filter_map(|replied| async move { replied })
        .collect::<HashSet<Ipv4Addr>>()
        .await
}
