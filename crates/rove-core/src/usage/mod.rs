//! Who used how much of the network: per-interface daily totals (`data`), the
//! live rate (`live`), per-app totals (`app`), and per-app remote hosts and
//! traffic kinds (`host`).
pub mod app;
pub mod data;
pub mod host;
pub mod live;

use serde::Serialize;

/// Whether this platform can meter per-app traffic right now. Mirrors
/// `AppUsageSupport` in `src/types/app-usage.ts`: when `Unsupported` the UI
/// explains why instead of showing an empty list.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Support {
    Supported,
    Unsupported,
}

/// A received/sent byte pair: a counter reading or a running total.
#[derive(Default, Clone, Copy)]
struct ByteCounts {
    rx: u64,
    tx: u64,
}
