//! Reverse hostname resolution and hostname hygiene.
use crate::shell::{try_run_powershell, try_run_timeout};
use regex_lite::Regex;
use std::collections::HashMap;
use std::sync::LazyLock;
use std::time::Duration;

/// Cap on concurrent per-host reverse-DNS lookups inside the single Unix batch
/// process. Each host still needs its own `getent`/`dscacheutil` subprocess, so
/// this bounds the `xargs -P` fan-out — without it a full `/24` would pile
/// hundreds of processes on top of the sweep and probe. Windows needs no such
/// cap: [`resolve_many`] resolves the whole batch in one PowerShell process.
const UNIX_HOSTNAME_CONCURRENCY: usize = 16;

static HOST_SUFFIX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\.(local|lan|home|localdomain|internal)\.?$").unwrap());

/// "pixel-7.lan" → "pixel-7".
pub fn trim_suffix(host: &str) -> String {
    HOST_SUFFIX.replace(host, "").into_owned()
}

/// Rejects strings that aren't syntactically valid hostnames. Reverse-DNS
/// tooling prints diagnostics to *stdout* — macOS `dig` emits lines like
/// ";; connection timed out; no servers could be reached" that `2>/dev/null`
/// can't catch — so error text can reach this filter as a candidate hostname.
/// A real hostname carries no whitespace or punctuation beyond `-`, `.`, `_`,
/// and holds at least one alphanumeric, so anything else is rejected outright.
fn is_valid_hostname(host: &str) -> bool {
    !host.is_empty()
        && host.len() <= 253
        && host.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '.' | '_'))
        && host.chars().any(|c| c.is_ascii_alphanumeric())
}

/// Rejects names that carry no information: systemd's synthetic `_gateway`
/// and routers echoing the MAC back ("ecb5fa189779", "98:17:3c:6d:03:1a").
fn is_meaningful(host: &str) -> bool {
    if host == "_gateway" || host == "gateway" {
        return false;
    }
    // Strip the separators a MAC might be written with (`-`, `_`, `:`) so both
    // the bare "ecb5fa189779" and colon forms collapse to 12 hex digits.
    let hex_only: String =
        host.chars().filter(|c| *c != '-' && *c != '_' && *c != ':').collect();
    !(hex_only.len() == 12 && hex_only.chars().all(|c| c.is_ascii_hexdigit()))
}

/// Resolve a batch of addresses to hostnames, aligned index-for-index with
/// `ips` (unresolved / meaningless names become `None`).
///
/// Every platform resolves the entire batch in a *single* process rather than
/// one process per host — each host process could block for seconds before
/// failing, which dominated scan latency. Windows fires the whole batch
/// concurrently in-process (`GetHostEntryAsync`); Unix fans out bounded
/// concurrent `getent`/`dscacheutil` lookups under one `xargs -P` process.
pub async fn resolve_many(ips: &[String]) -> Vec<Option<String>> {
    if ips.is_empty() {
        return Vec::new();
    }
    if std::env::consts::OS == "windows" {
        resolve_many_windows(ips).await
    } else {
        resolve_many_unix(ips).await
    }
}

/// Total wall-clock budget for a Unix batch. The per-host `getent`/`dscacheutil`
/// lookups fan out through `xargs -P`, so — unlike the Windows path — there is
/// no in-process async wait to bound; a tokio timeout caps the whole batch.
const UNIX_BATCH_BUDGET_MS: u64 = 4000;

async fn resolve_many_unix(ips: &[String]) -> Vec<Option<String>> {
    // Only validated IPs are interpolated into the script; anything else is
    // dropped (and stays `None` below).
    let safe: Vec<&str> = ips
        .iter()
        .map(String::as_str)
        .filter(|ip| crate::net_util::is_shell_safe_ip(ip))
        .collect();

    let mut resolved: HashMap<String, String> = HashMap::new();
    if !safe.is_empty() {
        let list = safe.join(" ");
        // One lookup per IP, fanned out `UNIX_HOSTNAME_CONCURRENCY`-wide inside a
        // single `sh` process. The per-IP snippet is single-quoted, so it uses
        // only double quotes internally; the `\$2` reaches the inner `sh`, which
        // unescapes it to `$2` for awk. Each invocation ends with a plain `if`
        // (never a bare failing test), so an unresolved host exits 0 — otherwise
        // `xargs` would report 123 and `capture()` would discard the whole batch.
        // Emits `ip<TAB>hostname` per resolved IP.
        let per_ip = if std::env::consts::OS == "macos" {
            // macOS has no getent; dscacheutil queries the same resolver stack.
            // But its reverse lookups are cache-backed: on a cold cache it returns
            // nothing, so a randomized-MAC phone whose only identity is its PTR
            // ("iPhone") shows as an Unknown device until some later query warms
            // the cache. Fall back to a bounded unicast `dig +short -x`, which
            // asks the router's resolver directly (it knows the name from the
            // DHCP lease) and doesn't depend on the cache — stripping dig's
            // trailing dot. Absent `dig`, the fallback yields empty and we degrade
            // to the dscacheutil-only behavior.
            //
            // `dig` writes its comment/diagnostic lines (e.g. ";; connection timed
            // out; no servers could be reached") to *stdout*, not stderr, so
            // `2>/dev/null` doesn't catch them. Pick the first line that actually
            // looks like a name (starts alphanumeric) rather than `head -n1`, so a
            // failed lookup yields empty instead of leaking the error as a hostname.
            r#"n=$(dscacheutil -q host -a ip_address "$1" 2>/dev/null | awk "/^name:/{print \$2; exit}"); if [ -z "$n" ]; then n=$(dig +short +time=1 +tries=1 -x "$1" 2>/dev/null | awk "/^[A-Za-z0-9]/{print; exit}" | sed "s/\.$//"); fi; if [ -n "$n" ]; then printf "%s\t%s\n" "$1" "$n"; fi"#
        } else {
            r#"h=$(timeout 1 getent hosts "$1" 2>/dev/null); n=$(printf "%s" "$h" | awk "{print \$2; exit}"); if [ -n "$n" ]; then printf "%s\t%s\n" "$1" "$n"; fi"#
        };
        let script = format!(
            "printf '%s\\n' {list} | xargs -P {UNIX_HOSTNAME_CONCURRENCY} -I@ sh -c '{per_ip}' _ @"
        );
        if let Some(out) =
            try_run_timeout(&script, Duration::from_millis(UNIX_BATCH_BUDGET_MS)).await
        {
            for line in out.lines() {
                let Some((ip, host)) = line.split_once('\t') else {
                    continue;
                };
                let host = trim_suffix(host.trim());
                if is_valid_hostname(&host) && is_meaningful(&host) {
                    resolved.insert(ip.trim().to_string(), host);
                }
            }
        }
    }

    ips.iter().map(|ip| resolved.get(ip).cloned()).collect()
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
                if is_valid_hostname(&host) && is_meaningful(&host) {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_mac_shaped_names_the_router_echoes_back() {
        // Bare and separator forms of a MAC all collapse to 12 hex digits.
        assert!(!is_meaningful("ecb5fa189779"));
        assert!(!is_meaningful("98:17:3c:6d:03:1a"));
        assert!(!is_meaningful("ec-b5-fa-18-97-79"));
        assert!(!is_meaningful("_gateway"));
        // Real names — including a hex-looking one that isn't 12 digits — survive.
        assert!(is_meaningful("iPhone"));
        assert!(is_meaningful("pixel-7"));
        assert!(is_meaningful("deadbeef")); // 8 digits, not a MAC
    }

    #[test]
    fn rejects_reverse_dns_error_text() {
        // The exact leak: macOS `dig` diagnostics that reached the name field.
        assert!(!is_valid_hostname(";; connection timed out; no servers could be reached"));
        assert!(!is_valid_hostname("no servers could be reached"));
        assert!(!is_valid_hostname(";;"));
        assert!(!is_valid_hostname(""));
        // Real hostnames pass.
        assert!(is_valid_hostname("pixel-7"));
        assert!(is_valid_hostname("Nabils-MacBook"));
        assert!(is_valid_hostname("nas.home"));
        assert!(is_valid_hostname("host_1"));
    }

    #[test]
    fn trims_local_suffixes() {
        assert_eq!(trim_suffix("pixel-7.lan"), "pixel-7");
        assert_eq!(trim_suffix("nas.local."), "nas");
        assert_eq!(trim_suffix("host.internal"), "host");
        assert_eq!(trim_suffix("plain"), "plain");
    }
}
