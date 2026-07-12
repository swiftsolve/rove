//! OS-specific implementations of host and network state.
//!
//! Rove observes the same facts on every platform — the interface list, the
//! active Wi-Fi/Ethernet details, the LAN subnet, routing and DNS — but each OS
//! exposes them through different tools (`ip`/`iw` on Linux, `Get-NetAdapter`
//! /`netsh` on Windows, `ifconfig`/CoreWLAN on macOS). This module collects
//! those per-OS probes in one place, one file per platform:
//!
//!   * [`linux`]   — `ip`, `iw`, `ethtool`, `nmcli`, `/sys`
//!   * [`windows`] — PowerShell (`Get-NetAdapter`, `Find-NetRoute`), `netsh`
//!   * [`macos`]   — `ifconfig`, `system_profiler`, CoreWLAN (via [`mac_native`])
//!
//! The cross-platform *contract* — which probe to call, and the fallback chain
//! when a tool is missing — stays in the feature modules (`interfaces`,
//! `network_info`, `devices::subnet`, `data_usage`); they dispatch into here.
//! Shared, OS-agnostic glue (the sysinfo fallback, Wi-Fi post-processing, the
//! windowless-spawn helper, interface sorting) lives in this file.

pub mod linux;
pub mod mac_native;
pub mod macos;
pub mod windows;

use crate::net_util::is_virtual_interface;
use crate::network_info::infer_connection_type;
use crate::shell::try_run;
use crate::types::{ConnectionDetails, InterfaceSummary};
use regex_lite::Regex;
use std::sync::LazyLock;

/// Spawn console child processes without briefly flashing a terminal window on
/// Windows. No-op elsewhere, where these commands never open a window. Applied
/// to the synchronous [`std::process::Command`] call sites (timezone probe,
/// `hostname`); the async [`crate::shell`] runner has its own equivalent.
#[cfg(windows)]
pub fn hide_console(cmd: &mut std::process::Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}
#[cfg(not(windows))]
pub fn hide_console(_cmd: &mut std::process::Command) {}

/// dBm RSSI → rough 0-100% bar, matching the Electron heuristic.
fn dbm_to_percent(dbm: i64) -> i64 {
    (2 * (dbm + 100)).clamp(0, 100)
}

/// Shared Wi-Fi post-processing: derive a percentage bar from RSSI when the OS
/// only gave us dBm. Every platform's `wifi_details` funnels through here.
pub(crate) fn finalize_wifi(mut d: ConnectionDetails) -> ConnectionDetails {
    if d.signal_strength.is_none() {
        if let Some(dbm) = d.signal_dbm {
            d.signal_strength = Some(dbm_to_percent(dbm));
        }
    }
    d
}

/// Non-Linux fallback interface list via sysinfo: names, MACs and first IPv4.
/// Also the ultimate fallback when a platform's native probe fails.
pub(crate) fn generic_interface_list() -> Vec<InterfaceSummary> {
    let networks = sysinfo::Networks::new_with_refreshed_list();
    let mut result: Vec<InterfaceSummary> = networks
        .iter()
        .filter(|(name, _)| !is_virtual_interface(name))
        .filter_map(|(name, data)| {
            let mac = data.mac_address().to_string().to_lowercase();
            // Filter/pseudo miniports (WFP, Npcap, …) report an all-zero
            // hardware address — they aren't real interfaces.
            if mac == "00:00:00:00:00:00" {
                return None;
            }
            let ip = data
                .ip_networks()
                .iter()
                .find(|ip| ip.addr.is_ipv4())
                .map(|ip| ip.addr.to_string());
            Some(InterfaceSummary {
                connection_type: infer_connection_type(name).into(),
                oper_state: if ip.is_some() { "up".into() } else { "unknown".into() },
                ip_address: ip,
                mac_address: Some(mac),
                speed_mbps: None,
                is_default: false,
                is_virtual: false,
                name: name.clone(),
            })
        })
        .collect();
    sort_interfaces(&mut result);
    result
}

/// Canonical interface ordering shared by every platform's list builder:
/// default route first, then real hardware before virtual, connected before
/// down, then by name.
pub(crate) fn sort_interfaces(list: &mut [InterfaceSummary]) {
    list.sort_by(|a, b| {
        let rank = |i: &InterfaceSummary| {
            (!i.is_default, i.is_virtual, i.oper_state != "up", i.name.clone())
        };
        rank(a).cmp(&rank(b))
    });
}

// ---- neighbor (ARP/NDP) table -------------------------------------------

/// One entry from the OS neighbor table: an IP the kernel has resolved to a MAC.
pub struct RawNeighbor {
    pub ip: String,
    pub mac: String,
    pub reachable: bool,
    /// Whether `reachable` reflects a real kernel liveness state (Linux `ip
    /// neigh`) rather than the `arp -a` fallback's blanket `true`. The device
    /// scan only trusts `reachable` for its liveness verdict when this is set;
    /// on macOS/Windows it relies on active probes instead.
    pub stateful: bool,
}

static ARP_A: LazyLock<Regex> = LazyLock::new(|| {
    // An IPv4, then (lazily, across whatever separates them) a 6-group MAC. The
    // separator must be matched with `.*?`, not a non-hex class: BSD `arp -a`
    // writes "<ip> at <mac>", and the `a` in "at" is itself a hex digit. Octets
    // are 1–2 hex because BSD zero-strips them ("af:0"); groups may be `:`- or
    // `-`-separated (Windows uses dashes).
    Regex::new(r"([0-9]{1,3}(?:\.[0-9]{1,3}){3}).*?([0-9a-fA-F]{1,2}(?:[:-][0-9a-fA-F]{1,2}){5})")
        .unwrap()
});

/// The kernel neighbor table. Linux's `ip neigh` carries a reachability state;
/// the `arp -a` fallback (macOS, Windows, and any Linux without `iproute2`) has
/// no state column, so entries are assumed reachable.
pub async fn neighbor_table() -> Vec<RawNeighbor> {
    if cfg!(target_os = "linux") {
        if let Some(neighbors) = linux::neighbors().await {
            return neighbors;
        }
    }
    arp_neighbors().await
}

/// Shared `arp` parse for the platforms without a stateful neighbor tool. Uses
/// the numeric table (`-n`) off Windows to skip per-host reverse DNS (the app
/// resolves names itself) — Windows `arp` doesn't take `-n`.
async fn arp_neighbors() -> Vec<RawNeighbor> {
    let cmd = if cfg!(target_os = "windows") { "arp -a" } else { "arp -an" };
    let Some(out) = try_run(cmd).await else {
        return Vec::new();
    };
    out.lines()
        .filter_map(|line| {
            let c = ARP_A.captures(line)?;
            let mac = crate::net_util::normalize_mac_colons(&c[2]);
            // Drop broadcast and multicast pseudo-neighbors; they aren't devices.
            if mac == "ff:ff:ff:ff:ff:ff" || mac.starts_with("01:00:5e") || mac.starts_with("33:33")
            {
                return None;
            }
            // `arp -a` has no liveness column, so `reachable` here is a
            // placeholder the scan ignores (stateful: false) in favour of its
            // own active probe.
            Some(RawNeighbor { ip: c[1].to_string(), mac, reachable: true, stateful: false })
        })
        .collect()
}

// ---- Wi-Fi channel plans ---------------------------------------------------

/// The three Wi-Fi bands, disambiguated by each platform's own hint (channel
/// numbers repeat across bands: 6 GHz channel 1 is not 2.4 GHz channel 1).
pub(crate) enum WifiBand {
    TwoFour,
    Five,
    Six,
}

/// Centre frequency (MHz) for a Wi-Fi `channel` in `band`, per the 802.11
/// channel plans. Channel 14 is the 2.4 GHz outlier: it sits at 2484 MHz,
/// 12 MHz above channel 13 rather than the plan's usual 5 MHz step.
pub(crate) fn channel_to_frequency(band: WifiBand, channel: i64) -> i64 {
    match band {
        WifiBand::TwoFour if channel == 14 => 2484,
        WifiBand::TwoFour => 2407 + channel * 5,
        WifiBand::Five => 5000 + channel * 5,
        WifiBand::Six => 5950 + channel * 5,
    }
}

// ---- ping ----------------------------------------------------------------

/// Build the OS-appropriate `ping` command sending `count` probes to `host`.
/// `timeout_ms` is the per-reply wait: Windows spells it `-w` and macOS `-W`,
/// both in milliseconds; Linux/BSD `-W` is in *seconds*, so there we use a fixed
/// `-W 1`. All Unix variants space probes 0.2 s apart (`-i 0.2`) and discard
/// stderr. `host` must be a validated address — it is interpolated in.
pub fn ping_command(host: &str, count: u32, timeout_ms: u32) -> String {
    if cfg!(target_os = "windows") {
        format!("ping -n {count} -w {timeout_ms} {host}")
    } else if cfg!(target_os = "macos") {
        // macOS `ping -W` is the per-reply wait in MILLISECONDS. The Linux `-W 1`
        // would be a 1 ms deadline that drops every real reply as "out of wait
        // time", printing no `time=` lines — so latency/jitter/loss came back
        // empty (100% loss) and every capability rated "unsupported".
        format!("ping -c {count} -i 0.2 -W {timeout_ms} {host} 2>/dev/null")
    } else {
        format!("ping -c {count} -i 0.2 -W 1 {host} 2>/dev/null")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn channel_frequency_follows_the_channel_plans() {
        assert_eq!(channel_to_frequency(WifiBand::TwoFour, 1), 2412);
        // Channel 14 is the 2.4 GHz outlier at 2484 MHz, not 2407 + 14*5 = 2477.
        assert_eq!(channel_to_frequency(WifiBand::TwoFour, 14), 2484);
        assert_eq!(channel_to_frequency(WifiBand::Five, 60), 5300);
        assert_eq!(channel_to_frequency(WifiBand::Six, 101), 6455);
    }
}
