//! Reverse hostname resolution and hostname hygiene.
use crate::shell::{try_run, try_run_powershell};
use futures_util::StreamExt;
use regex_lite::Regex;
use std::collections::HashMap;
use std::sync::LazyLock;

/// Cap on concurrent per-host reverse-DNS lookups on Unix. Each spawns a
/// subprocess (`getent`/`dscacheutil`), so an unbounded fan-out over a full
/// `/24` would pile hundreds of processes on top of the sweep and probe.
/// Windows sidesteps this entirely — [`resolve_many`] resolves the whole batch
/// in one PowerShell process.
const UNIX_HOSTNAME_CONCURRENCY: usize = 16;

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
    // The address goes into a shell command — only ever pass a validated IP.
    if !crate::net_util::is_shell_safe_ip(ip) {
        return None;
    }
    let out = if std::env::consts::OS == "windows" {
        try_run_powershell(&format!("[System.Net.Dns]::GetHostEntry('{ip}').HostName")).await?
    } else {
        let cmd = match std::env::consts::OS {
            // macOS has no getent; dscacheutil queries the same resolver stack.
            "macos" => format!(
                "dscacheutil -q host -a ip_address {ip} | awk '/^name:/ {{print $2; exit}}'"
            ),
            _ => format!("timeout 1 getent hosts {ip} | awk '{{print $2; exit}}'"),
        };
        try_run(&cmd).await?
    };
    let host = trim_suffix(out.trim());
    (!host.is_empty() && is_meaningful(&host)).then_some(host)
}

/// Resolve a batch of addresses to hostnames, aligned index-for-index with
/// `ips` (unresolved / meaningless names become `None`).
///
/// Windows resolves the entire batch in a *single* PowerShell process that
/// fires every reverse lookup concurrently (`GetHostEntryAsync`) and waits at
/// most [`WINDOWS_BATCH_BUDGET_MS`] total — versus one process per host, each
/// able to block for seconds before failing, which dominated scan latency.
/// Other platforms fan out bounded concurrent per-host lookups.
pub async fn resolve_many(ips: &[String]) -> Vec<Option<String>> {
    if ips.is_empty() {
        return Vec::new();
    }
    if std::env::consts::OS == "windows" {
        return resolve_many_windows(ips).await;
    }
    futures_util::stream::iter(ips.iter().cloned())
        .map(|ip| async move { resolve(&ip).await })
        .buffered(UNIX_HOSTNAME_CONCURRENCY)
        .collect()
        .await
}

/// Total wall-clock budget for a Windows batch of concurrent reverse lookups.
const WINDOWS_BATCH_BUDGET_MS: u32 = 2000;

async fn resolve_many_windows(ips: &[String]) -> Vec<Option<String>> {
    // Only validated IPs are interpolated into the script; anything else is
    // dropped (and stays `None` below).
    let safe: Vec<&str> = ips
        .iter()
        .map(String::as_str)
        .filter(|ip| crate::net_util::is_shell_safe_ip(ip))
        .collect();

    let mut resolved: HashMap<String, String> = HashMap::new();
    if !safe.is_empty() {
        let list = safe.iter().map(|ip| format!("'{ip}'")).collect::<Vec<_>>().join(",");
        // Kick off every lookup as a Task, wait once for the whole set (faulted
        // lookups make WaitAll throw, hence the try/catch), then read only the
        // ones that completed. Emits `ip<TAB>hostname` per line.
        let script = format!(
            "$ips=@({list});\
             $t=$ips|%{{[pscustomobject]@{{I=$_;T=[System.Net.Dns]::GetHostEntryAsync($_)}}}};\
             try{{[Threading.Tasks.Task]::WaitAll(@($t.T),{WINDOWS_BATCH_BUDGET_MS})|Out-Null}}catch{{}};\
             $t|%{{$n=if($_.T.Status -eq 'RanToCompletion'){{$_.T.Result.HostName}}else{{''}};\"$($_.I)`t$n\"}}"
        );
        if let Some(out) = try_run_powershell(&script).await {
            for line in out.lines() {
                let Some((ip, host)) = line.split_once('\t') else {
                    continue;
                };
                let host = trim_suffix(host.trim());
                if !host.is_empty() && is_meaningful(&host) {
                    resolved.insert(ip.trim().to_string(), host);
                }
            }
        }
    }

    ips.iter().map(|ip| resolved.get(ip).cloned()).collect()
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
            let mut cmd = std::process::Command::new("hostname");
            crate::platform::hide_console(&mut cmd);
            cmd.output()
                .ok()
                .and_then(|o| String::from_utf8(o.stdout).ok())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
        })
        .map(|h| trim_suffix(&h))
}
