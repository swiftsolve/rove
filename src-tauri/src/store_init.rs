//! Opening the durable store.
use crate::AppState;
use rove_core::{store::Store, usage::data::UsageTracker, util::net::lock};
use std::sync::Arc;
use tauri::Manager;

/// Open the SQLite store in the app-data dir and point the usage tracker at it.
pub fn init_store(app: &tauri::App) {
    let data_dir = app
        .path()
        .app_data_dir()
        .inspect(|dir| {
            let _ = std::fs::create_dir_all(dir);
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
