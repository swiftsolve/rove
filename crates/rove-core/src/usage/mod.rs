//! Who used how much of the network: per-interface daily totals (`data`), the
//! live rate (`live`), per-app totals (`app`), and per-app remote hosts and
//! traffic kinds (`host`).
pub mod app;
pub mod data;
pub mod host;
pub mod live;

/// A received/sent byte pair: a counter reading or a running total.
#[derive(Default, Clone, Copy)]
struct ByteCounts {
    rx: u64,
    tx: u64,
}
