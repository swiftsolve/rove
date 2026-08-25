//! The process's open-descriptor budget.
//!
//! A GUI app on macOS is launched by `launchd`, and inherits its
//! `RLIMIT_NOFILE` **soft** limit of 256 — not the 1024+ a shell hands out. The
//! device scan opens hundreds of concurrent TCP sockets ([`crate::devices::probe`])
//! while the ping sweep and every `try_run` probe spawn child processes, each
//! needing a pipe pair. Past 256 the two collide, and the failure is silent and
//! misdirected: `Command::spawn` fails instantly with `EMFILE`, [`crate::shell::try_run`]
//! maps that to `None`, and `default_interface()` — which reads `netstat -rn` on
//! macOS — reports *no interface*. The app then concludes the machine is offline
//! and logs a spurious `connection_lost` mid-scan, on a link that never dropped.
//!
//! Two guards, because either alone leaves a gap:
//!   * [`raise`] lifts the soft limit toward the hard one at startup, so the
//!     budget matches what the scan actually needs.
//!   * [`budget`] reports the *live* limit so the probe can size its concurrency
//!     to it, keeping headroom for subprocess pipes even where the raise was
//!     refused (a sandbox or an administratively lowered hard limit).

/// Descriptors to aim for. Comfortably covers a `/24` scan's concurrent sockets
/// plus subprocess pipes, the SQLite handles and the webview's own descriptors,
/// while staying far below macOS's `kern.maxfilesperproc`.
#[cfg(unix)]
const TARGET_FDS: u64 = 8192;

/// Raise the soft descriptor limit toward the hard limit, returning the soft
/// limit now in force. Called once at startup, before any scan runs.
///
/// Never fails loudly: a process that can't raise its limit keeps the one it
/// had, and [`budget`] sizes the scan to fit whatever that is.
#[cfg(unix)]
pub fn raise() -> u64 {
    // SAFETY: `getrlimit`/`setrlimit` with a valid resource and an owned,
    // fully-initialised `rlimit`; neither retains the pointer past the call.
    unsafe {
        let mut lim = std::mem::zeroed::<libc::rlimit>();
        if libc::getrlimit(libc::RLIMIT_NOFILE, &mut lim) != 0 {
            return 0;
        }
        // `RLIM_INFINITY` as a target would be rejected on macOS, which caps a
        // process at `kern.maxfilesperproc`; aim at a concrete figure instead.
        let hard = if lim.rlim_max == libc::RLIM_INFINITY {
            TARGET_FDS
        } else {
            (lim.rlim_max as u64).min(TARGET_FDS)
        };
        if (lim.rlim_cur as u64) < hard {
            let raised = libc::rlimit { rlim_cur: hard as libc::rlim_t, rlim_max: lim.rlim_max };
            if libc::setrlimit(libc::RLIMIT_NOFILE, &raised) == 0 {
                return hard;
            }
        }
        lim.rlim_cur as u64
    }
}

/// Windows has no per-process descriptor limit of this kind; sockets are bounded
/// by handles and ephemeral ports instead.
#[cfg(not(unix))]
pub fn raise() -> u64 {
    0
}

/// The soft descriptor limit currently in force, or `None` where the platform
/// has no such limit.
#[cfg(unix)]
pub fn current() -> Option<u64> {
    // SAFETY: as in `raise` — a valid resource and an owned `rlimit` out-param.
    unsafe {
        let mut lim = std::mem::zeroed::<libc::rlimit>();
        (libc::getrlimit(libc::RLIMIT_NOFILE, &mut lim) == 0).then_some(lim.rlim_cur as u64)
    }
}

#[cfg(not(unix))]
pub fn current() -> Option<u64> {
    None
}

/// How many descriptors a bulk network stage may hold at once: `want`, reduced
/// to fit the live limit when it can't. Reserves [`RESERVED_FDS`] for everything
/// running alongside — subprocess pipes, the database, the webview — because a
/// stage that consumes the *whole* budget doesn't fail itself, it fails whatever
/// else needs a descriptor while it runs. That is precisely the misdirected
/// failure this module exists to prevent.
pub fn budget(want: usize) -> usize {
    /// Held back for everything holding descriptors alongside a bulk stage. The
    /// dominant claim is the ICMP sweep, which runs 64 `sh -c ping` children
    /// concurrently with the TCP probe and costs a stdout+stderr pipe pair each;
    /// the rest covers the database, the webview and the one-off `try_run`
    /// probes whose silent failure is the whole reason for this guard.
    const RESERVED_FDS: u64 = 192;
    /// Never squeeze a stage below this — it would be slower than it is useful.
    const FLOOR: usize = 32;

    match current() {
        Some(limit) => {
            let spare = limit.saturating_sub(RESERVED_FDS).max(FLOOR as u64);
            want.min(spare as usize).max(FLOOR)
        }
        None => want,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_generous_limit_leaves_the_request_untouched() {
        // The real limit under `cargo test` is a shell's, far above any `want`
        // the scan asks for, so the request passes through unchanged.
        assert_eq!(budget(400), 400);
    }

    #[test]
    fn the_budget_never_collapses_to_nothing() {
        // Whatever the limit, a stage always gets a workable floor rather than
        // a concurrency of zero (which would stall the scan entirely).
        assert!(budget(1) >= 1);
        assert!(budget(400) >= 32);
    }
}
