//! Rove's platform services — everything the UI needs to observe a network.
//! Pure Rust (no Tauri/GTK dependency) so it compiles and tests anywhere.
pub mod capabilities;
pub mod data_usage;
pub mod devices;
pub mod diagnostics;
pub mod interfaces;
pub mod live_throughput;
pub mod mdns;
pub mod net_util;
pub mod network_info;
pub mod oui;
pub mod platform;
pub mod shell;
pub mod speed;
pub mod store;
pub mod types;
