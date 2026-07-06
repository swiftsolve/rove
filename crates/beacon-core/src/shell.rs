use std::time::Duration;
use tokio::process::Command;

/// Windows `CREATE_NO_WINDOW`: spawn console child processes without briefly
/// flashing a terminal window on screen.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Suppress the console window a child process would otherwise pop up. No-op
/// off Windows, where these commands never open a window to begin with.
#[cfg(windows)]
fn hide_window(cmd: &mut Command) {
    cmd.creation_flags(CREATE_NO_WINDOW);
}
#[cfg(not(windows))]
fn hide_window(_cmd: &mut Command) {}

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
    hide_window(&mut cmd);
    capture(cmd, timeout).await
}

/// Run a PowerShell expression on Windows, capturing stdout.
///
/// The script is passed as a single argument to `powershell.exe` rather than
/// embedded in a `cmd /C "powershell -Command \"...\""` string. Routing it
/// through `cmd` makes cmd.exe collapse the nested `\"` escapes, so PowerShell
/// receives the expression as a bare string literal and echoes it back instead
/// of executing it — which is why the UI showed raw command text. Passing it
/// as one arg means PowerShell parses it exactly once, intact. Runs windowless.
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
