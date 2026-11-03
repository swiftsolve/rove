//! Rove's platform services: everything the UI needs to observe a network.
//! Pure Rust with no Tauri or GTK dependency, so it compiles and tests anywhere.
//!
//! One module per domain the UI shows, named after its folder in
//! `src/features` (`live-throughput` as `live_throughput`), plus the pieces
//! they share: `platform` (per-OS readers), `store` (the SQLite file) and
//! `utils` (small helpers).
pub mod apps;
pub mod capabilities;
pub mod connection;
pub mod devices;
pub mod diagnostics;
pub mod interfaces;
pub mod live_throughput;
pub mod platform;
pub mod services;
pub mod speed;
pub mod store;
pub mod usage;
pub mod utils;
