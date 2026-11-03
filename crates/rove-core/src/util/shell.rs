//! Running the platform tools the probes read, windowless and with a timeout.
use std::time::Duration;
use tokio::process::Command;

/// Windows `CREATE_NO_WINDOW`: without it each console child flashes a
/// terminal window on screen.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Keep a child from popping up a console window. A no-op off Windows, where
/// these commands never open one.
#[cfg(windows)]
fn hide_window(cmd: &mut Command) {
    cmd.creation_flags(CREATE_NO_WINDOW);
}
#[cfg(not(windows))]
fn hide_window(_cmd: &mut Command) {}

/// Run a shell command, capturing stdout. None on failure, timeout or empty
/// output, so callers treat a missing tool as "no data".
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
    hide_window(&mut cmd);
    capture(cmd, timeout).await
}

/// Run a PowerShell expression on Windows, capturing stdout.
///
/// The script goes to `powershell.exe` as one argument, not inside a
/// `cmd /C "powershell -Command \"...\""` string: cmd.exe collapses the nested
/// `\"` escapes, so PowerShell gets a bare string literal and echoes it back
/// instead of running it (the UI once showed raw command text).
pub async fn try_run_powershell(script: &str) -> Option<String> {
    let mut cmd = Command::new("powershell");
    cmd.args(["-NoProfile", "-NonInteractive", "-Command", script]);
    hide_window(&mut cmd);
    capture(cmd, Duration::from_secs(15)).await
}

async fn capture(mut cmd: Command, timeout: Duration) -> Option<String> {
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
