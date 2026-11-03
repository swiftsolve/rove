//! File logging and panic capture, so field issues can be diagnosed from
//! `rove.log` alone.

/// Per-user log directory in each platform's usual place, so `rove.log.<date>`
/// can be found without root.
fn log_dir() -> Option<std::path::PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("LOCALAPPDATA").map(|d| std::path::PathBuf::from(d).join("rove").join("logs"))
    }
    #[cfg(target_os = "macos")]
    {
        std::env::var_os("HOME").map(|h| std::path::PathBuf::from(h).join("Library/Logs/rove"))
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Some(state) = std::env::var_os("XDG_STATE_HOME") {
            return Some(std::path::PathBuf::from(state).join("rove"));
        }
        std::env::var_os("HOME").map(|h| std::path::PathBuf::from(h).join(".local/state/rove"))
    }
}

/// Start file logging into a daily-rolled `rove.log` under [`log_dir`]. The
/// guard flushes on drop, so hold it for the process's lifetime. `info` unless
/// `ROVE_LOG` says otherwise (`ROVE_LOG=debug`). Best-effort: `None` rather
/// than failing startup.
pub fn init_logging() -> Option<tracing_appender::non_blocking::WorkerGuard> {
    let dir = log_dir()?;
    std::fs::create_dir_all(&dir).ok()?;

    let (writer, guard) = tracing_appender::non_blocking(tracing_appender::rolling::daily(&dir, "rove.log"));
    let filter = tracing_subscriber::EnvFilter::try_from_env("ROVE_LOG")
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));

    let is_installed = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_writer(writer)
        .with_ansi(false)
        .with_target(false)
        .try_init()
        .is_ok();
    is_installed.then_some(guard)
}

/// Also log panics to the file, so a crash leaves a trace when launched from a
/// desktop menu with no console.
pub fn install_panic_logger() {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        tracing::error!(target: "panic", "{info}");
        default_hook(info);
    }));
}
