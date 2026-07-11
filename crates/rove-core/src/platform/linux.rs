//! Linux host/network probes: `ip`, `iw`, `ethtool`, `nmcli`, `/sys`.
use super::RawNeighbor;
use crate::net_util::is_virtual_interface;
use crate::network_info::infer_connection_type;
use crate::shell::{first_int, first_match, try_run};
use crate::types::{ConnectionDetails, InterfaceSummary};
use regex_lite::Regex;
use std::net::Ipv4Addr;
use std::sync::LazyLock;

static LINUX_NEIGHBOR: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^([\d.]+)\s+dev\s+\S+\s+lladdr\s+([0-9a-f:]{17})\s+(\S+)").unwrap()
});

macro_rules! static_regex {
    ($name:ident, $pattern:literal) => {
        static $name: LazyLock<Regex> = LazyLock::new(|| Regex::new($pattern).unwrap());
    };
}

/// Negotiated link speed (Mbps) from `/sys/class/net/<iface>/speed`. `None`
/// when the file is unreadable or reports a non-positive placeholder (a down
/// link or virtual interface prints -1). Linux-only by nature — callers on
/// other platforms must not reach for it.
pub fn sysfs_link_speed(iface: &str) -> Option<i64> {
    std::fs::read_to_string(format!("/sys/class/net/{iface}/speed"))
        .ok()
        .and_then(|raw| raw.trim().parse::<i64>().ok())
        .filter(|v| *v > 0)
}

static_regex!(IW_SIGNAL, r"signal:\s*(-?\d+)");
static_regex!(IW_SSID, r"SSID:\s*(.+)");
static_regex!(IW_FREQ, r"freq:\s*(\d+)");
static_regex!(IW_TX_BITRATE, r"tx bitrate:\s*([\d.]+)\s*MBit/s");
static_regex!(IW_CHANNEL, r"channel\s+(\d+)");
static_regex!(IW_CHANNEL_FREQ, r"channel\s+\d+\s+\((\d+)");
static_regex!(ETHTOOL_SPEED, r"Speed:\s*(\d+)");
static_regex!(ETHTOOL_DUPLEX, r"Duplex:\s*(\w+)");

/// Interface list from `ip -j addr`; falls back to the sysinfo list if `ip` is
/// absent or its output doesn't parse.
pub async fn interface_list() -> Vec<InterfaceSummary> {
    let Some(out) = try_run("ip -j addr 2>/dev/null").await else {
        return super::generic_interface_list();
    };
    let Ok(parsed) = serde_json::from_str::<Vec<serde_json::Value>>(&out) else {
        return super::generic_interface_list();
    };

    let default = crate::network_info::default_interface().await;
    let mut result = Vec::new();

    for entry in parsed {
        let Some(name) = entry["ifname"].as_str().map(String::from) else {
            continue;
        };
        if name == "lo" {
            continue;
        }

        let ip = entry["addr_info"]
            .as_array()
            .and_then(|addrs| {
                addrs
                    .iter()
                    .find(|a| a["family"] == "inet")
                    .and_then(|a| a["local"].as_str())
            })
            .map(String::from);

        let oper_state = entry["operstate"].as_str().unwrap_or("unknown").to_lowercase();

        let speed = sysfs_link_speed(&name);

        let is_virtual = is_virtual_interface(&name);
        result.push(InterfaceSummary {
            connection_type: if is_virtual {
                "virtual".into()
            } else {
                infer_connection_type(&name).into()
            },
            is_default: default.as_deref() == Some(name.as_str()),
            is_virtual,
            oper_state,
            ip_address: ip,
            mac_address: entry["address"].as_str().map(str::to_lowercase),
            speed_mbps: speed,
            name,
        });
    }

    super::sort_interfaces(&mut result);
    result
}

fn parse_nmcli_wifi_line(line: &str) -> ConnectionDetails {
    let parts: Vec<&str> = line.trim().split(':').collect();
    let mut d = ConnectionDetails::default();
    if parts.first() != Some(&"yes") {
        return d;
    }
    d.ssid = parts.get(1).filter(|s| !s.is_empty()).map(|s| s.to_string());
    d.signal_strength = parts.get(2).and_then(|s| s.parse().ok());
    d.frequency = parts.get(3).and_then(|s| s.parse().ok());
    d.channel = parts.get(4).and_then(|s| s.parse().ok());
    d.security = parts.get(5).filter(|s| !s.is_empty()).map(|s| s.to_string());
    d
}

pub async fn wifi_details(iface: &str) -> ConnectionDetails {
    let mut d = ConnectionDetails::default();

    let nmcli = try_run(&format!(
        "nmcli -t -f ACTIVE,SSID,SIGNAL,FREQ,CHAN,SECURITY dev wifi list ifname {iface} 2>/dev/null | grep '^yes'"
    ))
    .await;
    if let Some(out) = nmcli {
        if let Some(line) = out.lines().next() {
            d = parse_nmcli_wifi_line(line);
        }
    }

    if let Some(out) = try_run(&format!("iw dev {iface} link 2>/dev/null")).await {
        d.signal_dbm = d.signal_dbm.or(first_int(&out, &IW_SIGNAL));
        if d.ssid.is_none() {
            d.ssid = first_match(&out, &IW_SSID).map(|s| s.trim().to_string());
        }
        d.frequency = d.frequency.or(first_int(&out, &IW_FREQ));
        if d.link_speed_mbps.is_none() {
            d.link_speed_mbps = first_match(&out, &IW_TX_BITRATE)
                .and_then(|s| s.parse::<f64>().ok())
                .map(|mbps| mbps.round() as i64)
                .filter(|v| *v > 0);
        }
    }

    if let Some(out) = try_run(&format!("iw dev {iface} info 2>/dev/null")).await {
        d.channel = d.channel.or(first_int(&out, &IW_CHANNEL));
        d.frequency = d.frequency.or(first_int(&out, &IW_CHANNEL_FREQ));
    }

    if d.ssid.is_none() {
        if let Some(out) = try_run(&format!("iwgetid {iface} -r 2>/dev/null")).await {
            let ssid = out.trim().to_string();
            if !ssid.is_empty() {
                d.ssid = Some(ssid);
            }
        }
    }

    super::finalize_wifi(d)
}

pub async fn ethernet_details(iface: &str) -> ConnectionDetails {
    let mut d = ConnectionDetails::default();

    if let Some(out) = try_run(&format!("ethtool {iface} 2>/dev/null")).await {
        d.link_speed_mbps = first_int(&out, &ETHTOOL_SPEED);
        d.duplex = first_match(&out, &ETHTOOL_DUPLEX);
    }
    // /sys fallback when ethtool is missing
    if d.link_speed_mbps.is_none() {
        d.link_speed_mbps = sysfs_link_speed(iface);
    }

    if let Some(out) = try_run(&format!(
        "nmcli -t -f GENERAL.VENDOR,GENERAL.PRODUCT device show {iface} 2>/dev/null"
    ))
    .await
    {
        for line in out.lines() {
            if let Some(v) = line.strip_prefix("GENERAL.VENDOR:") {
                d.vendor = Some(v.trim().to_string()).filter(|s| !s.is_empty());
            }
            if let Some(v) = line.strip_prefix("GENERAL.PRODUCT:") {
                d.product = Some(v.trim().to_string()).filter(|s| !s.is_empty());
            }
        }
    }
    d
}

/// The interface's IPv4 address and prefix length via `ip -j addr show`. `None`
/// when `ip` is missing or the interface has no IPv4; the caller turns this into
/// a CIDR. `ip -j` is authoritative on Linux.
pub async fn subnet_of(interface: &str) -> Option<(Ipv4Addr, u32)> {
    if !crate::net_util::is_shell_safe_iface(interface) {
        return None;
    }
    let out = try_run(&format!("ip -j addr show {interface} 2>/dev/null")).await?;
    let parsed: Vec<serde_json::Value> = serde_json::from_str(&out).ok()?;
    let addr = parsed
        .first()?["addr_info"]
        .as_array()?
        .iter()
        .find(|a| a["family"] == "inet")?
        .clone();

    let ip: Ipv4Addr = addr["local"].as_str()?.parse().ok()?;
    let prefix = addr["prefixlen"].as_u64()? as u32;
    Some((ip, prefix))
}

/// The neighbor table via `ip neigh show`, carrying reachability state. `None`
/// when `ip` is unavailable, so the caller falls back to `arp -a`.
pub async fn neighbors() -> Option<Vec<RawNeighbor>> {
    let out = try_run("ip neigh show 2>/dev/null").await?;
    Some(
        out.lines()
            .filter_map(|line| {
                let c = LINUX_NEIGHBOR.captures(line)?;
                Some(RawNeighbor {
                    ip: c[1].to_string(),
                    mac: c[2].to_lowercase(),
                    reachable: matches!(&c[3], "REACHABLE" | "DELAY" | "PROBE"),
                })
            })
            .collect(),
    )
}

/// Kernel-cumulative rx/tx byte totals across physical interfaces, read from
/// `/sys/class/net/*/statistics`. `None` when `/sys` can't be enumerated, so
/// the caller falls back to sysinfo totals.
pub fn boot_totals() -> Option<(u64, u64)> {
    let entries = std::fs::read_dir("/sys/class/net").ok()?;
    let mut rx = 0u64;
    let mut tx = 0u64;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if is_virtual_interface(&name) {
            continue;
        }
        let read = |file: &str| -> u64 {
            std::fs::read_to_string(entry.path().join("statistics").join(file))
                .ok()
                .and_then(|raw| raw.trim().parse().ok())
                .unwrap_or(0)
        };
        rx += read("rx_bytes");
        tx += read("tx_bytes");
    }
    Some((rx, tx))
}
