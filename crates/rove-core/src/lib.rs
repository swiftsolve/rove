//! Rove's platform services — everything the UI needs to observe a network.
//! Pure Rust (no Tauri/GTK dependency) so it compiles and tests anywhere.
//!
//! One module per domain the UI shows, plus the pieces they share: `platform`
//! (per-OS readers), `store` (the SQLite file) and `util` (small helpers).
pub mod connection;
pub mod devices;
pub mod diagnostics;
pub mod platform;
pub mod services;
pub mod speed;
pub mod store;
pub mod usage;
pub mod util;
