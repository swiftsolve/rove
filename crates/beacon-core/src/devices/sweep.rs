//! Active discovery: probe every host in the subnet so idle devices enter
//! the neighbor table. The ARP exchange triggered by a probe registers a
//! device even when it drops ICMP.
use futures_util::StreamExt;
use std::net::Ipv4Addr;
use std::time::Duration;

const CONCURRENT_PROBES: usize = 64;

pub async fn sweep(subnet: &str) {
    let Some((network, prefix)) = super::subnet::parse(subnet) else {
        return;
    };
    if !(24..=30).contains(&prefix) {
        return; // larger ranges are impolite to sweep; smaller ones pointless
    }

    let base = u32::from(network);
    let hosts =
        (1u32..(1 << (32 - prefix)) - 1).map(move |offset| Ipv4Addr::from(base + offset).to_string());

    futures_util::stream::iter(hosts)
        .map(|ip| async move {
            let cmd = crate::platform::ping_command(&ip, 1, 700);
            let _ = crate::shell::try_run_timeout(&cmd, Duration::from_secs(3)).await;
        })
        .buffer_unordered(CONCURRENT_PROBES)
        .collect::<Vec<()>>()
        .await;
}
