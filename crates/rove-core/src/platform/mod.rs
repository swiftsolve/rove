//! Per-OS probes for host and network state. Every platform reports the same
//! facts (interfaces, Wi-Fi and Ethernet details, subnet, routing, DNS) through
//! different tools, one file each:
//!
//!   * [`linux`]: `ip`, `iw`, `ethtool`, `nmcli`, `/sys`
//!   * [`windows`]: PowerShell (`Get-NetAdapter`, `Get-NetRoute`), `netsh`
//!   * [`macos`]: `ifconfig`, `netstat`, `networksetup`, `system_profiler`,
//!     and CoreWLAN via [`mac_native`]
//!   * [`app_icon`]: each OS's native app icons
//!
//! Which probe to call, and the fallback when a tool is missing, stays in the
//! feature modules (`connection`, `devices`, `usage`). This file holds the
//! shared pieces: the sysinfo interface fallback, Wi-Fi post-processing and
//! channel plans, interface sorting, the neighbor table, `ping` flags, and the
//! windowless-spawn helper.

pub mod app_icon;
pub mod linux;
pub mod mac_native;
pub mod macos;
pub mod windows;

use crate::connection::infer_connection_type;
use crate::connection::ConnectionDetails;
use crate::interfaces::InterfaceSummary;
use crate::utils::net::is_virtual_interface;
use crate::utils::shell::try_run;
use regex_lite::Regex;
use std::sync::LazyLock;

/// Stop a console child process flashing a terminal window on Windows; a no-op
/// elsewhere. For the synchronous [`std::process::Command`] call sites (the
/// timezone probe, `hostname`); [`crate::utils::shell`] has its own.
#[cfg(windows)]
pub fn hide_console(cmd: &mut std::process::Command) {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(crate::utils::shell::CREATE_NO_WINDOW);
}
#[cfg(not(windows))]
pub fn hide_console(_cmd: &mut std::process::Command) {}

/// dBm RSSI to a rough 0-100% bar: linear from -100 dBm (0) to -50 dBm (100).
fn dbm_to_percent(dbm: i64) -> i64 {
    (2 * (dbm + 100)).clamp(0, 100)
}

/// Every platform's `wifi_details` ends here: fill the percentage bar from dBm
/// when the OS gave only dBm, so the meter looks the same everywhere.
pub(crate) fn finalize_wifi(mut d: ConnectionDetails) -> ConnectionDetails {
    if d.signal_strength.is_none() {
        if let Some(dbm) = d.signal_dbm {
            d.signal_strength = Some(dbm_to_percent(dbm));
        }
    }
    d
}

/// Interface list from sysinfo (names, MACs, first IPv4), for when a native
/// probe fails or a platform has none.
pub(crate) fn generic_interface_list() -> Vec<InterfaceSummary> {
    let networks = sysinfo::Networks::new_with_refreshed_list();
    let mut result: Vec<InterfaceSummary> = networks
        .iter()
        .filter(|(name, _)| !is_virtual_interface(name))
        .filter_map(|(name, data)| {
            let mac = data.mac_address().to_string().to_lowercase();
            // Filter and pseudo miniports (WFP, Npcap, …) report an all-zero
            // MAC; they aren't real interfaces.
            if mac == "00:00:00:00:00:00" {
                return None;
            }
            let ip = data.ip_networks().iter().find(|ip| ip.addr.is_ipv4()).map(|ip| ip.addr.to_string());
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

/// The interface order on every platform: default route first, then hardware
/// before virtual, up before down, then by name.
pub(crate) fn sort_interfaces(list: &mut [InterfaceSummary]) {
    list.sort_by(|a, b| {
        let rank = |i: &InterfaceSummary| (!i.is_default, i.is_virtual, i.oper_state != "up", i.name.clone());
        rank(a).cmp(&rank(b))
    });
}

/// One entry from the OS neighbor table: an IP the kernel has resolved to a MAC.
pub struct RawNeighbor {
    pub ip: String,
    pub mac: String,
    pub is_reachable: bool,
    /// Whether `is_reachable` is a real kernel state (Linux `ip neigh`) rather than
    /// the `arp -a` fallback's blanket `true`. The device scan only trusts
    /// `is_reachable` when this is set, and relies on its own probes otherwise.
    pub is_stateful: bool,
}

static ARP_A: LazyLock<Regex> = LazyLock::new(|| {
    // An IPv4, then lazily a 6-group MAC. The gap is `.*?`, not a non-hex class:
    // BSD writes "<ip> at <mac>", and the `a` in "at" is a hex digit. Groups are
    // 1-2 hex digits because BSD drops leading zeros ("af:0"), separated by `:`
    // or, on Windows, `-`.
    Regex::new(r"([0-9]{1,3}(?:\.[0-9]{1,3}){3}).*?([0-9a-fA-F]{1,2}(?:[:-][0-9a-fA-F]{1,2}){5})")
        .expect("a valid pattern")
});

/// The kernel neighbor table.
///
/// Linux's `ip neigh` has a reachability state; the `arp -a` fallback (macOS,
/// Windows, Linux without `iproute2`) doesn't, so its entries are marked
/// `is_reachable` but not `is_stateful`.
pub async fn neighbor_table() -> Vec<RawNeighbor> {
    if cfg!(target_os = "linux") {
        if let Some(neighbors) = linux::neighbors().await {
            return neighbors;
        }
    }
    arp_neighbors().await
}

/// `arp` for the platforms without `ip neigh`. `-n` skips per-host reverse DNS
/// (Rove resolves names itself), but Windows `arp` doesn't take it.
async fn arp_neighbors() -> Vec<RawNeighbor> {
    let cmd = if cfg!(target_os = "windows") { "arp -a" } else { "arp -an" };
    let Some(out) = try_run(cmd).await else {
        return Vec::new();
    };
    out.lines()
        .filter_map(|line| {
            let c = ARP_A.captures(line)?;
            let mac = crate::utils::net::normalize_mac_colons(&c[2]);
            // Broadcast and multicast (IPv4 01:00:5e, IPv6 33:33) aren't devices.
            if mac == "ff:ff:ff:ff:ff:ff" || mac.starts_with("01:00:5e") || mac.starts_with("33:33") {
                return None;
            }
            // No liveness column, so `is_reachable` is a placeholder the scan
            // ignores (`is_stateful: false`).
            Some(RawNeighbor { ip: c[1].to_string(), mac, is_reachable: true, is_stateful: false })
        })
        .collect()
}

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

/// The `ping` command for this OS, sending `count` probes to `host`.
///
/// `timeout_ms` is the per-reply wait: Windows `-w` and macOS `-W` take
/// milliseconds, but Linux `-W` takes seconds, so Linux gets a fixed `-W 1`.
/// `host` is spliced into a shell command, so it must be a validated address.
pub fn ping_command(host: &str, count: u32, timeout_ms: u32) -> String {
    if cfg!(target_os = "windows") {
        format!("ping -n {count} -w {timeout_ms} {host}")
    } else if cfg!(target_os = "macos") {
        // Not Linux's `-W 1`: on macOS that's a 1 ms wait, so every reply
        // arrives too late and diagnostics read 100% loss.
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
