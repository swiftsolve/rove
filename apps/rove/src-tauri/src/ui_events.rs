//! Pushing events to the UI.
use crate::error::log_if_failed;
use tauri::Emitter;

/// Emit `event` to every window. A failed emit (the app shutting down, say) is
/// logged rather than returned: the UI's poll catches up either way.
pub fn emit_to_ui<S: serde::Serialize + Clone>(handle: &tauri::AppHandle, event: &str, payload: S) {
    log_if_failed(&format!("emit {event}"), handle.emit(event, payload));
}
