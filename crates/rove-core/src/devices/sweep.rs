//! Active discovery: probe every host in the subnet so idle devices enter
//! the neighbor table. The ARP exchange triggered by a probe registers a
//! device even when it drops ICMP.
use futures_util::StreamExt;
use std::time::Duration;

const CONCURRENT_PROBES: usize = 64;

pub async fn sweep(subnet: &str) {
    let Some(hosts) = super::subnet::hosts(subnet) else {
        return;
    };

    futures_util::stream::iter(hosts.map(|ip| ip.to_string()))
        .map(|ip| async move {
            let cmd = crate::platform::ping_command(&ip, 1, 700);
            let _ = crate::shell::try_run_timeout(&cmd, Duration::from_secs(3)).await;
        })
        .buffer_unordered(CONCURRENT_PROBES)
        .collect::<Vec<()>>()
        .await;
}
