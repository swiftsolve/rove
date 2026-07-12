//! Active discovery: probe every host in the subnet so idle devices enter
//! the neighbor table. The ARP exchange triggered by a probe registers a
//! device even when it drops ICMP.
use futures_util::StreamExt;
use std::collections::HashSet;
use std::time::Duration;

const CONCURRENT_PROBES: usize = 64;

/// Ping every host in the subnet and return the IPs that actually replied.
/// `try_run_timeout` yields `None` when `ping` exits non-zero (no reply), so a
/// `Some` result is a positive liveness signal — the scan uses it to tell a
/// device that's answering now from one merely lingering in the ARP cache.
pub async fn sweep(subnet: &str) -> HashSet<String> {
    let Some(hosts) = super::subnet::hosts(subnet) else {
        return HashSet::new();
    };

    futures_util::stream::iter(hosts.map(|ip| ip.to_string()))
        .map(|ip| async move {
            let cmd = crate::platform::ping_command(&ip, 1, 700);
            let replied = crate::shell::try_run_timeout(&cmd, Duration::from_secs(3))
                .await
                .is_some();
            replied.then_some(ip)
        })
        .buffer_unordered(CONCURRENT_PROBES)
        .filter_map(|replied| async move { replied })
        .collect::<HashSet<String>>()
        .await
}
