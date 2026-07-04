use crate::network_info::{default_interface, infer_connection_type};
use crate::shell::try_run;
use crate::types::InterfaceSummary;
use serde_json::Value;

/// (ip4, mac) for one interface.
pub async fn address_of(name: &str) -> (Option<String>, Option<String>) {
    for iface in list().await {
        if iface.name == name {
            return (iface.ip_address, iface.mac_address);
        }
    }
    (None, None)
}

/// Cross-platform base list; Linux gets full detail from `ip -j addr` + /sys.
pub async fn list() -> Vec<InterfaceSummary> {
    if cfg!(target_os = "linux") {
        linux_list().await
    } else {
        generic_list()
    }
}

async fn linux_list() -> Vec<InterfaceSummary> {
    let Some(out) = try_run("ip -j addr 2>/dev/null").await else {
        return generic_list();
    };
    let Ok(parsed) = serde_json::from_str::<Vec<Value>>(&out) else {
        return generic_list();
    };

    let default = default_interface().await;
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

        let oper_state = entry["operstate"]
            .as_str()
            .unwrap_or("unknown")
            .to_lowercase();

        let speed = std::fs::read_to_string(format!("/sys/class/net/{name}/speed"))
            .ok()
            .and_then(|raw| raw.trim().parse::<i64>().ok())
            .filter(|v| *v > 0);

        result.push(InterfaceSummary {
            connection_type: if crate::net_util::is_virtual_interface(&name) {
                "virtual".into()
            } else {
                infer_connection_type(&name).into()
            },
            is_default: default.as_deref() == Some(name.as_str()),
            oper_state,
            ip_address: ip,
            mac_address: entry["address"].as_str().map(str::to_lowercase),
            speed_mbps: speed,
            name,
        });
    }

    sort(&mut result);
    result
}

/// Non-Linux fallback via sysinfo: names, MACs and first IPv4.
fn generic_list() -> Vec<InterfaceSummary> {
    let networks = sysinfo::Networks::new_with_refreshed_list();
    let mut result: Vec<InterfaceSummary> = networks
        .iter()
        .filter(|(name, _)| !crate::net_util::is_virtual_interface(name))
        .map(|(name, data)| {
            let ip = data
                .ip_networks()
                .iter()
                .find(|ip| ip.addr.is_ipv4())
                .map(|ip| ip.addr.to_string());
            InterfaceSummary {
                connection_type: infer_connection_type(name).into(),
                oper_state: if ip.is_some() { "up".into() } else { "unknown".into() },
                ip_address: ip,
                mac_address: Some(data.mac_address().to_string().to_lowercase()),
                speed_mbps: None,
                is_default: false,
                name: name.clone(),
            }
        })
        .collect();
    sort(&mut result);
    result
}

fn sort(list: &mut [InterfaceSummary]) {
    list.sort_by(|a, b| {
        let rank = |i: &InterfaceSummary| {
            (
                !i.is_default,
                i.oper_state != "up",
                i.connection_type == "virtual",
                i.name.clone(),
            )
        };
        rank(a).cmp(&rank(b))
    });
}
