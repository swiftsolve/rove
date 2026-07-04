use std::time::Duration;
use tokio::process::Command;

/// Run a shell command, capturing stdout. Returns None on failure/timeout —
/// callers treat missing tools as "no data", mirroring the Electron app.
pub async fn try_run(command: &str) -> Option<String> {
    try_run_timeout(command, Duration::from_secs(15)).await
}

pub async fn try_run_timeout(command: &str, timeout: Duration) -> Option<String> {
    let mut cmd = if cfg!(target_os = "windows") {
        let mut c = Command::new("cmd");
        c.args(["/C", command]);
        c
    } else {
        let mut c = Command::new("sh");
        c.args(["-c", command]);
        c
    };

    let output = tokio::time::timeout(timeout, cmd.output()).await.ok()?.ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout).into_owned();
    if text.trim().is_empty() {
        None
    } else {
        Some(text)
    }
}

pub fn first_match(text: &str, re: &regex_lite::Regex) -> Option<String> {
    re.captures(text)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
}

pub fn first_int(text: &str, re: &regex_lite::Regex) -> Option<i64> {
    first_match(text, re)?.parse().ok()
}
