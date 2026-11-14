//! The one error type the Tauri commands return. The UI receives it as its
//! message string, which is all it reads.
use rove_core::{connection::wifi_share::WifiShareError, speed::SpeedTestError, store::StoreError};

#[derive(Debug, thiserror::Error)]
pub enum CommandError {
    #[error(transparent)]
    Store(#[from] StoreError),
    #[error(transparent)]
    SpeedTest(#[from] SpeedTestError),
    #[error(transparent)]
    WifiShare(#[from] WifiShareError),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[cfg(windows)]
    #[error("Elevation was declined.")]
    ElevationDeclined,
    #[cfg(not(windows))]
    #[error("Elevation is only supported on Windows.")]
    ElevationUnsupported,
}

impl serde::Serialize for CommandError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.collect_str(self)
    }
}

pub type CommandResult<T> = Result<T, CommandError>;

/// Log a failed best-effort step, one whose failure mustn't fail its caller
/// (a history write beside a read, a window call), so it still leaves a trace in
/// `rove.log`. `action` completes "could not …".
pub fn log_if_failed<E: std::fmt::Display>(action: &str, result: Result<(), E>) {
    if let Err(e) = result {
        tracing::warn!("could not {action}: {e}");
    }
}
