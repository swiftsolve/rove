use std::time::Duration;
use tokio::process::Command;

/// Why a shell probe produced no output.
///
/// The distinction that matters is [`ShellError::Spawn`] versus everything else.
/// Every other variant is *evidence about the machine being probed*: the tool ran
/// and said no, or took too long, or had nothing to report. `Spawn` is not — it
/// means the probe never ran, so it says nothing at all about what was being
/// measured.
///
/// Collapsing the two is how a descriptor exhaustion once surfaced as a network
/// outage: `netstat -rn` failed to spawn with `EMFILE` mid-scan, the caller read
/// the resulting "no output" as "no default route", and the app logged a
/// `connection_lost` on a link that never dropped (see [`crate::platform::fd_limit`]).
#[derive(Debug)]
pub enum ShellError {
    /// The command never started — the binary is missing, or this process is out
    /// of descriptors or process slots (`EMFILE`/`ENFILE`/`EAGAIN`).
    Spawn(std::io::Error),
    /// Started, but outran its deadline.
    Timeout,
    /// Ran to completion and reported failure.
    Status(Option<i32>),
    /// Ran and succeeded, but printed nothing usable.
    Empty,
}

impl ShellError {
    /// Whether this failure is *this* process hitting a resource ceiling rather
    /// than a fact about what was probed. A caller that infers machine state
    /// from a probe must treat these as "unknown", never as a negative result.
    #[cfg(unix)]
    pub fn is_exhaustion(&self) -> bool {
        let Self::Spawn(e) = self else { return false };
        // Named constants, not literals: `EAGAIN` is 11 on Linux and 35 on macOS,
        // so a hardcoded number would silently mean the wrong errno on one of them.
        //   EMFILE — this process is out of descriptors
        //   ENFILE — the system is
        //   EAGAIN — no process slot; the fork itself failed
        matches!(e.raw_os_error(), Some(code) if code == libc::EMFILE || code == libc::ENFILE || code == libc::EAGAIN)
    }

    /// Windows reports handle exhaustion through channels this errno check can't
    /// see, so it never claims exhaustion — only that the probe didn't run.
    #[cfg(not(unix))]
    pub fn is_exhaustion(&self) -> bool {
        false
    }

    /// Whether the probe ran at all. `false` means its silence is not evidence.
    pub fn probe_ran(&self) -> bool {
        !matches!(self, Self::Spawn(_))
    }
}

impl std::fmt::Display for ShellError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Spawn(e) => write!(f, "could not start: {e}"),
            Self::Timeout => write!(f, "timed out"),
            Self::Status(Some(code)) => write!(f, "exited {code}"),
            Self::Status(None) => write!(f, "killed by signal"),
            Self::Empty => write!(f, "no output"),
        }
    }
}

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
///
/// Use [`run`] instead where the *absence* of output would be read as a fact
/// about the machine: this returns the same `None` whether the tool answered
/// "nothing" or never ran at all.
pub async fn try_run(command: &str) -> Option<String> {
    try_run_timeout(command, Duration::from_secs(15)).await
}

pub async fn try_run_timeout(command: &str, timeout: Duration) -> Option<String> {
    run_timeout(command, timeout).await.ok()
}

/// Run a shell command, capturing stdout, and say *why* on failure.
pub async fn run(command: &str) -> Result<String, ShellError> {
    run_timeout(command, Duration::from_secs(15)).await
}

/// [`run`] with an explicit deadline.
pub async fn run_timeout(command: &str, timeout: Duration) -> Result<String, ShellError> {
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
    let out = capture(cmd, timeout).await;
    // A probe that never started is a fault in *this* process, not in what it
    // was measuring, and it is otherwise invisible — every caller turns it into
    // the same empty result. Log it once, here, where the cause is still known.
    if let Err(e) = &out {
        if !e.probe_ran() {
            tracing::warn!(command, error = %e, exhaustion = e.is_exhaustion(), "shell probe never ran");
        }
    }
    out
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
    capture(cmd, Duration::from_secs(15)).await.ok()
}

async fn capture(mut cmd: Command, timeout: Duration) -> Result<String, ShellError> {
    // `cmd.output()` folds two very different failures into one `io::Error`: the
    // spawn itself failing, and the wait/read failing afterwards. Only the spawn
    // is distinguishable here, and it is the one that matters — everything else
    // means the command did run.
    let output = match tokio::time::timeout(timeout, cmd.output()).await {
        Err(_) => return Err(ShellError::Timeout),
        Ok(Err(e)) => return Err(ShellError::Spawn(e)),
        Ok(Ok(output)) => output,
    };
    if !output.status.success() {
        return Err(ShellError::Status(output.status.code()));
    }
    let text = String::from_utf8_lossy(&output.stdout).into_owned();
    if text.trim().is_empty() {
        Err(ShellError::Empty)
    } else {
        Ok(text)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn a_command_that_ran_and_failed_is_distinguishable_from_one_that_never_started() {
        // Ran, exited non-zero: real evidence about what was probed.
        let ran = run("exit 3").await.unwrap_err();
        assert!(ran.probe_ran(), "a non-zero exit means the command did run");
        assert!(!ran.is_exhaustion());

        // Ran, printed nothing: also real evidence — the tool had no answer.
        let empty = run("true").await.unwrap_err();
        assert!(matches!(empty, ShellError::Empty));
        assert!(empty.probe_ran());
    }

    #[tokio::test]
    async fn a_missing_interpreter_reports_that_the_probe_never_ran() {
        // Spawning a binary that doesn't exist is the one failure mode where the
        // command truly never started, so it must not read as a negative result.
        let err = capture(Command::new("rove-no-such-binary-exists"), Duration::from_secs(5))
            .await
            .unwrap_err();
        assert!(matches!(err, ShellError::Spawn(_)));
        assert!(!err.probe_ran(), "a spawn failure is not evidence about the machine");
    }

    #[tokio::test]
    async fn a_timeout_counts_as_having_run() {
        let err = run_timeout("sleep 5", Duration::from_millis(50)).await.unwrap_err();
        assert!(matches!(err, ShellError::Timeout));
        assert!(err.probe_ran(), "it started; it just didn't finish");
    }

    #[tokio::test]
    async fn try_run_still_flattens_every_failure_to_none() {
        // The Option-returning API is unchanged for its ~50 callers: this is the
        // compatibility guarantee that kept the refactor from touching them all.
        assert!(try_run("exit 1").await.is_none());
        assert!(try_run("echo hello").await.is_some());
    }
}
