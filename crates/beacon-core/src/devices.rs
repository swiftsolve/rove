use crate::network_info::{default_gateway, default_interface};
use crate::oui::{is_randomized_mac, lookup_vendor};
use crate::shell::try_run;
use crate::types::{LanDevice, LanDeviceScan};
use regex_lite::Regex;

struct RawNeighbor {
    ip: String,
    mac: String,
    reachable: bool,
}

async fn neighbors() -> Vec<RawNeighbor> {
    if cfg!(target_os = "linux") {
        if let Some(out) = try_run("ip neigh show 2>/dev/null").await {
            let re = Regex::new(r"^([\d.]+)\s+dev\s+\S+\s+lladdr\s+([0-9a-f:]{17})\s+(\S+)").unwrap();
            return out
                .lines()
                .filter_map(|line| {
                    let c = re.captures(line)?;
                    Some(RawNeighbor {
                        ip: c[1].to_string(),
                        mac: c[2].to_lowercase(),
                        reachable: matches!(&c[3], "REACHABLE" | "DELAY" | "PROBE"),
                    })
                })
                .collect();
        }
    }
    // macOS / Windows: `arp -a`
    if let Some(out) = try_run("arp -a").await {
        let re = Regex::new(r"\(?([\d.]+)\)?[^0-9a-fA-F]+([0-9a-fA-F]{1,2}[:-][0-9a-fA-F:-]{13,16})").unwrap();
        return out
            .lines()
            .filter_map(|line| {
                let c = re.captures(line)?;
                Some(RawNeighbor {
                    ip: c[1].to_string(),
                    mac: c[2].to_lowercase().replace('-', ":"),
                    reachable: true,
                })
            })
            .collect();
    }
    Vec::new()
}

fn trim_host_suffix(host: &str) -> String {
    let re = Regex::new(r"\.(local|lan|home|localdomain|internal)\.?$").unwrap();
    re.replace(&host.to_string(), "").into_owned()
}

fn is_meaningful_hostname(host: &str) -> bool {
    let stripped: String = host.chars().filter(|c| *c != '-' && *c != '_').collect();
    !(stripped.len() == 12 && stripped.chars().all(|c| c.is_ascii_hexdigit()))
}

async fn resolve_hostname(ip: &str) -> Option<String> {
    let cmd = if cfg!(target_os = "windows") {
        format!("powershell -NoProfile -Command \"[System.Net.Dns]::GetHostEntry('{ip}').HostName\"")
    } else {
        format!("timeout 0.6 getent hosts {ip} | awk '{{print $2; exit}}'")
    };
    let out = try_run(&cmd).await?;
    let host = trim_host_suffix(out.trim());
    (!host.is_empty() && is_meaningful_hostname(&host)).then_some(host)
}

fn kind_from_hostname(host: &str) -> Option<&'static str> {
    let patterns: [(&str, &str); 6] = [
        (r"(?i)iphone|ipad|pixel|galaxy|android|oneplus|redmi|phone", "phone"),
        (r"(?i)macbook|imac|desktop|laptop|thinkpad|workstation|nuc", "computer"),
        (r"(?i)appletv|apple-tv|roku|chromecast|shield|firetv|fire-tv|bravia|webos", "tv"),
        (r"(?i)printer|officejet|laserjet|deskjet|brother|epson", "printer"),
        (r"(?i)^hs\d{3}|^ks\d{3}|kasa|wemo|ecobee|cosori|airfryer|vacuum|roomba|thermostat|doorbell|esp[-_]?\d|tasmota|shelly|sonoff|plug|cam", "iot"),
        (r"(?i)router|gateway|unifi|openwrt|mikrotik", "router"),
    ];
    for (pattern, kind) in patterns {
        if Regex::new(pattern).unwrap().is_match(host) {
            return Some(kind);
        }
    }
    None
}

fn kind_from_vendor(vendor: &str) -> Option<&'static str> {
    let patterns: [(&str, &str); 6] = [
        (r"(?i)zyxel|tp-link|ubiquiti|netgear|mikrotik|asus|router|d-link|aruba|cisco", "router"),
        (r"(?i)raspberry|intel|dell|lenovo|hp\b|framework|gigabyte|msi", "computer"),
        (r"(?i)apple|samsung|xiaomi|oneplus|huawei|oppo|motorola", "phone"),
        (r"(?i)roku|vizio|lg elec|hisense|tcl|sony|nintendo|chromecast", "tv"),
        (r"(?i)brother|canon|epson|lexmark", "printer"),
        (r"(?i)espressif|tuya|sonoff|nest|amazon|google|ring|wyze|philips hue|shelly|sonos", "iot"),
    ];
    for (pattern, kind) in patterns {
        if Regex::new(pattern).unwrap().is_match(vendor) {
            return Some(kind);
        }
    }
    None
}

fn classify(vendor: Option<&str>, hostname: Option<&str>, is_gateway: bool, is_self: bool) -> String {
    if is_gateway {
        return "router".into();
    }
    if is_self {
        return "computer".into();
    }
    if let Some(kind) = hostname.and_then(kind_from_hostname) {
        return kind.into();
    }
    if let Some(kind) = vendor.and_then(kind_from_vendor) {
        return kind.into();
    }
    "unknown".into()
}

async fn subnet_of(iface: &str) -> Option<String> {
    let out = try_run(&format!(
        "ip -j addr show {iface} 2>/dev/null"
    ))
    .await?;
    let parsed: Vec<serde_json::Value> = serde_json::from_str(&out).ok()?;
    let addr = parsed.first()?["addr_info"]
        .as_array()?
        .iter()
        .find(|a| a["family"] == "inet")?
        .clone();
    let local = addr["local"].as_str()?;
    let prefix = addr["prefixlen"].as_u64()?;
    let ip: std::net::Ipv4Addr = local.parse().ok()?;
    let mask = u32::MAX << (32 - prefix as u32);
    let network = std::net::Ipv4Addr::from(u32::from(ip) & mask);
    Some(format!("{network}/{prefix}"))
}

fn in_subnet(ip: &str, subnet: &str) -> bool {
    let Some((net, prefix)) = subnet.split_once('/') else {
        return true;
    };
    let (Ok(ip), Ok(net), Ok(prefix)) = (
        ip.parse::<std::net::Ipv4Addr>(),
        net.parse::<std::net::Ipv4Addr>(),
        prefix.parse::<u32>(),
    ) else {
        return true;
    };
    let mask = if prefix == 0 { 0 } else { u32::MAX << (32 - prefix) };
    (u32::from(ip) & mask) == (u32::from(net) & mask)
}

pub async fn scan() -> LanDeviceScan {
    let (raw, gateway, iface) = tokio::join!(neighbors(), default_gateway(), default_interface());

    let subnet = match &iface {
        Some(name) if cfg!(target_os = "linux") => subnet_of(name).await,
        _ => None,
    };

    let (self_ip, self_mac) = match &iface {
        Some(name) => crate::interfaces::address_of(name).await,
        None => (None, None),
    };

    let in_scope: Vec<RawNeighbor> = raw
        .into_iter()
        .filter(|n| subnet.as_deref().map(|s| in_subnet(&n.ip, s)).unwrap_or(true))
        .collect();

    let hostnames = futures_util::future::join_all(in_scope.iter().map(|n| resolve_hostname(&n.ip))).await;

    let mut devices: Vec<LanDevice> = in_scope
        .into_iter()
        .zip(hostnames)
        .map(|(n, hostname)| {
            let vendor = lookup_vendor(&n.mac).map(String::from);
            let is_gateway = gateway.as_deref() == Some(n.ip.as_str());
            let is_self = self_ip.as_deref() == Some(n.ip.as_str());
            LanDevice {
                kind: classify(vendor.as_deref(), hostname.as_deref(), is_gateway, is_self),
                is_randomized_mac: is_randomized_mac(&n.mac),
                vendor,
                hostname,
                is_gateway,
                is_self,
                reachable: n.reachable,
                ip: n.ip,
                mac: n.mac,
            }
        })
        .collect();

    // The neighbor table never lists this machine — add it for a complete count.
    if let (Some(ip), Some(mac)) = (&self_ip, &self_mac) {
        if !devices.iter().any(|d| &d.mac == mac) {
            let hostname = hostname::get_hostname().map(|h| trim_host_suffix(&h));
            devices.push(LanDevice {
                ip: ip.clone(),
                mac: mac.clone(),
                vendor: lookup_vendor(mac).map(String::from),
                hostname,
                kind: "computer".into(),
                is_randomized_mac: is_randomized_mac(mac),
                is_gateway: false,
                is_self: true,
                reachable: true,
            });
        }
    }

    devices.sort_by(|a, b| {
        let rank = |d: &LanDevice| (!d.is_gateway, !d.is_self, ip_key(&d.ip));
        rank(a).cmp(&rank(b))
    });
    devices.dedup_by(|a, b| a.mac == b.mac);

    LanDeviceScan {
        devices,
        subnet,
        interface_name: iface,
        scanned_at: crate::net_util::now_ms(),
    }
}

fn ip_key(ip: &str) -> u32 {
    ip.parse::<std::net::Ipv4Addr>().map(u32::from).unwrap_or(u32::MAX)
}

mod hostname {
    pub fn get_hostname() -> Option<String> {
        std::fs::read_to_string("/etc/hostname")
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .or_else(|| std::env::var("COMPUTERNAME").ok())
            .or_else(|| std::env::var("HOSTNAME").ok())
    }
}
