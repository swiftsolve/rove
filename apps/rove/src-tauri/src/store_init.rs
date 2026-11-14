//! Opening the durable store.
use crate::AppState;
use rove_core::{store::Store, usage::UsageTracker, utils::net::lock};
use std::sync::Arc;
use tauri::Manager;

/// Open the SQLite store in the app-data dir and point the usage tracker at it.
pub fn init_store(app: &tauri::App) {
    let data_dir = app
        .path()
        .app_data_dir()
        .inspect(|dir| {
            // Opening the store below reports the failure that matters.
            if let Err(e) = std::fs::create_dir_all(dir) {
                tracing::warn!("could not create the app-data folder {}: {e}", dir.display());
            }
        })
        .unwrap_or_else(|_| std::path::PathBuf::from("."));

    let store = match Store::open(&data_dir.join("rove.db")) {
        Ok(store) => Arc::new(store),
        Err(err) => {
            tracing::error!("failed to open database: {err}");
            return;
        }
    };

    let state = app.state::<AppState>();
    *lock(&state.usage) = Some(UsageTracker::new(store.clone()));
    app.manage(store);
}
