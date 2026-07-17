//! Opening the durable store and importing what older formats left behind.
use crate::AppState;
use rove_core::{data_usage::UsageTracker, net_util::lock, store::Store};
use std::sync::Arc;
use tauri::Manager;

/// Open the SQLite store in the app-data dir, importing any usage history left
/// behind by the previous JSON-file format, and point the usage tracker at it.
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

    import_legacy_usage(&store, &data_dir.join("data-usage.json"));

    let state = app.state::<AppState>();
    *lock(&state.usage) = Some(UsageTracker::new(store.clone()));
    app.manage(store);
}

/// Fold the old `data-usage.json` daily buckets into the database once, then
/// leave the file in place (harmless) so a downgrade could still read it.
fn import_legacy_usage(store: &Store, json_path: &std::path::Path) {
    if !store.usage_is_empty().unwrap_or(true) {
        return; // already have usage rows — nothing to import.
    }

    #[derive(serde::Deserialize)]
    struct LegacyBucket {
        rx: u64,
        tx: u64,
    }
    #[derive(serde::Deserialize)]
    struct LegacyUsage {
        #[serde(default)]
        days: std::collections::HashMap<String, LegacyBucket>,
        first_sample_at: Option<u64>,
    }

    let Some(legacy) = std::fs::read_to_string(json_path)
        .ok()
        .and_then(|raw| serde_json::from_str::<LegacyUsage>(&raw).ok())
    else {
        return;
    };

    for (date, bucket) in &legacy.days {
        let _ = store.add_usage(date, bucket.rx, bucket.tx);
    }
    if let Some(first) = legacy.first_sample_at {
        let _ = store.set_meta_u64("usage_first_sample_at", first);
    }
}
