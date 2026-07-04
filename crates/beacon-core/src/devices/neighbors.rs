//! Reading the kernel's neighbor (ARP) table.
use crate::shell::try_run;
use regex_lite::Regex;
use std::sync::LazyLock;

pub struct RawNeighbor {
    pub ip: String,
    pub mac: String,
    pub reachable: bool,
}

static LINUX_NEIGHBOR: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^([\d.]+)\s+dev\s+\S+\s+lladdr\s+([0-9a-f:]{17})\s+(\S+)").unwrap()
});

static ARP_A: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\(?([\d.]+)\)?[^0-9a-fA-F]+([0-9a-fA-F]{1,2}[:-][0-9a-fA-F:-]{13,16})").unwrap()
});

pub async fn neighbors() -> Vec<RawNeighbor> {
    if cfg!(target_os = "linux") {
        if let Some(out) = try_run("ip neigh show 2>/dev/null").await {
            return out
                .lines()
                .filter_map(|line| {
                    let c = LINUX_NEIGHBOR.captures(line)?;
                    Some(RawNeighbor {
                        ip: c[1].to_string(),
                        mac: c[2].to_lowercase(),
                        reachable: matches!(&c[3], "REACHABLE" | "DELAY" | "PROBE"),
                    })
                })
                .collect();
        }
    }

    // macOS / Windows: parse `arp -a` (no state column — assume reachable).
    if let Some(out) = try_run("arp -a").await {
        return out
            .lines()
            .filter_map(|line| {
                let c = ARP_A.captures(line)?;
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
