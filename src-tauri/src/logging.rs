//! File logging and panic capture, so field issues can be diagnosed from
//! `rove.log` alone.

/// Per-user log directory, following each platform's convention. Chosen so a
/// user (or we, when debugging) can find `rove.log.<date>` without root.
fn log_dir() -> Option<std::path::PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("LOCALAPPDATA")
            .map(|d| std::path::PathBuf::from(d).join("rove").join("logs"))
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
/// returned guard flushes the non-blocking writer on drop, so the caller must
/// hold it for the process's lifetime. Level defaults to `info`; override with
/// the `ROVE_LOG` env var (e.g. `ROVE_LOG=debug`). Best-effort — returns
/// `None` if the log dir can't be created rather than failing startup.
pub fn init_logging() -> Option<tracing_appender::non_blocking::WorkerGuard> {
    let dir = log_dir()?;
    std::fs::create_dir_all(&dir).ok()?;

    let (writer, guard) = tracing_appender::non_blocking(tracing_appender::rolling::daily(
        &dir,
        "rove.log",
    ));
    let filter = tracing_subscriber::EnvFilter::try_from_env("ROVE_LOG")
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));

    let ok = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_writer(writer)
        .with_ansi(false)
        .with_target(false)
        .try_init()
        .is_ok();
    ok.then_some(guard)
}

/// Route panics to the log file (in addition to the default stderr handler), so
/// a crash leaves a durable breadcrumb even when the app was launched from a
/// desktop menu with no visible console.
pub fn install_panic_logger() {
    let default = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        tracing::error!(target: "panic", "{info}");
        default(info);
    }));
}
