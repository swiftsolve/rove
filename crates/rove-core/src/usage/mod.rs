//! Who used how much of the network: per-interface daily totals (`data`), the
//! live rate (`live`), per-app totals (`app`), and per-app remote hosts and
//! traffic kinds (`host`).
pub mod app;
pub mod data;
pub mod host;
pub mod live;

// One source per OS behind the same `sys` API (`SEMANTICS`, `support`,
// `support_detail`, `sample_units`, `sample_peers`), so `app` and `host` carry
// no per-OS branches. The Linux and macOS parsers build in every test run.
#[cfg(windows)]
mod etw;
#[cfg(any(target_os = "linux", test))]
mod linux;
#[cfg(any(target_os = "macos", test))]
mod macos;
#[cfg(windows)]
mod windows;

#[cfg(target_os = "linux")]
use linux as sys;
#[cfg(target_os = "macos")]
use macos as sys;
#[cfg(windows)]
use windows as sys;

/// No per-process source here, so every view reads as unsupported.
#[cfg(not(any(target_os = "linux", target_os = "macos", windows)))]
mod sys {
    use super::app::{CounterSemantics, UsageUnit};
    use super::host::PeerReading;
    use super::Support;

    // Nothing is ever sampled, so the choice doesn't matter.
    pub(super) const SEMANTICS: CounterSemantics = CounterSemantics::Socket;

    pub(super) fn support() -> Support {
        Support::Unsupported
    }

    pub(super) fn support_detail() -> Option<String> {
        None
    }

    pub(super) async fn sample_units() -> Option<Vec<UsageUnit>> {
        None
    }

    pub(super) async fn sample_peers() -> Option<Vec<PeerReading>> {
        None
    }
}

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
