//! ICMP sweep: ping every host in the subnet so idle devices enter the neighbor
//! table. The ARP exchange each ping triggers registers a device even when it
//! drops ICMP.
use futures_util::StreamExt;
use std::collections::HashSet;
use std::time::Duration;

const CONCURRENT_PROBES: usize = 64;

/// Ping every host in the subnet and return the IPs that replied. `ping` exits
/// non-zero without a reply, so `Some` is a positive liveness signal: the scan
/// uses it to tell a device answering now from one lingering in the ARP cache.
pub async fn sweep(subnet: &str) -> HashSet<String> {
    let Some(hosts) = super::subnet::hosts(subnet) else {
        return HashSet::new();
    };

    futures_util::stream::iter(hosts.map(|ip| ip.to_string()))
        .map(|ip| async move {
            let cmd = crate::platform::ping_command(&ip, 1, 700);
            let replied = crate::util::shell::try_run_timeout(&cmd, Duration::from_secs(3))
                .await
                .is_some();
            replied.then_some(ip)
        })
        .buffer_unordered(CONCURRENT_PROBES)
        .filter_map(|replied| async move { replied })
        .collect::<HashSet<String>>()
        .await
}
