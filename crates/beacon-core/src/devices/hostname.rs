//! Reverse hostname resolution and hostname hygiene.
use crate::shell::try_run;
use regex_lite::Regex;
use std::sync::LazyLock;

static HOST_SUFFIX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\.(local|lan|home|localdomain|internal)\.?$").unwrap());

/// "pixel-7.lan" → "pixel-7".
pub fn trim_suffix(host: &str) -> String {
    HOST_SUFFIX.replace(host, "").into_owned()
}

/// Rejects names that carry no information: systemd's synthetic `_gateway`
/// and routers echoing the MAC back ("ecb5fa189779").
fn is_meaningful(host: &str) -> bool {
    if host == "_gateway" || host == "gateway" {
        return false;
    }
    let hex_only: String = host.chars().filter(|c| *c != '-' && *c != '_').collect();
    !(hex_only.len() == 12 && hex_only.chars().all(|c| c.is_ascii_hexdigit()))
}

pub async fn resolve(ip: &str) -> Option<String> {
    let cmd = match std::env::consts::OS {
        "windows" => format!(
            "powershell -NoProfile -Command \"[System.Net.Dns]::GetHostEntry('{ip}').HostName\""
        ),
        // macOS has no getent; dscacheutil queries the same resolver stack.
        "macos" => format!(
            "dscacheutil -q host -a ip_address {ip} | awk '/^name:/ {{print $2; exit}}'"
        ),
        _ => format!("timeout 1 getent hosts {ip} | awk '{{print $2; exit}}'"),
    };
    let out = try_run(&cmd).await?;
    let host = trim_suffix(out.trim());
    (!host.is_empty() && is_meaningful(&host)).then_some(host)
}

/// This machine's own hostname, for the self entry.
pub fn local_machine_name() -> Option<String> {
    std::fs::read_to_string("/etc/hostname")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| std::env::var("COMPUTERNAME").ok())
        .or_else(|| std::env::var("HOSTNAME").ok())
        .or_else(|| {
            // macOS and most Unixes: the plain `hostname` binary.
            std::process::Command::new("hostname")
                .output()
                .ok()
                .and_then(|o| String::from_utf8(o.stdout).ok())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
        })
        .map(|h| trim_suffix(&h))
}
