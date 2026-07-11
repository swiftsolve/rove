//! Scan coalescing: one in-flight LAN scan, shared by every concurrent caller.
use futures_util::future::FutureExt;
use rove_core::types::LanDeviceScan;
use std::sync::atomic::Ordering;

type SharedScan =
    futures_util::future::Shared<std::pin::Pin<Box<dyn std::future::Future<Output = LanDeviceScan> + Send>>>;

/// Hard ceiling on a single LAN scan. A healthy scan takes ~6s, so this sits
/// well above the normal case, yet low enough that a wedged probe or a host that
/// stalls an enrichment round can't tie up device polling for minutes.
/// Overlapping scans — the usual cause of runaway times — are already prevented
/// by the dedupe guard below; this is the backstop for everything else.
const SCAN_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

/// Coalesces concurrent LAN scans. Each `scan()` probes the subnet with up to
/// 64 concurrent `ping` subprocesses; if the frontend's 45s poll (plus
/// `onNetworkChanged` nudges during Wi-Fi roaming) fires a new request while a
/// slow scan is still running, launching a *second* scan doubles that
/// subprocess load and starves the tokio runtime — which is what made
/// `get_network_info` time out. This guard makes overlapping callers await the
/// single in-flight scan instead of starting their own.
#[derive(Default)]
pub struct DeviceScanner {
    /// The in-flight scan (a cheaply-cloneable `Shared` future) tagged with a
    /// generation id, or `None` when idle. The id lets the caller that started
    /// a scan clear the slot on completion *without* clobbering a newer scan
    /// that a later caller may have installed in the meantime.
    inflight: tokio::sync::Mutex<Option<(u64, SharedScan)>>,
    next_id: std::sync::atomic::AtomicU64,
}

impl DeviceScanner {
    /// Run a scan, or join the one already in flight. Sequential (non-overlapping)
    /// calls each get a fresh scan; overlapping calls all resolve to the same result.
    /// The scan is bounded by `SCAN_TIMEOUT`; on expiry it yields an empty result
    /// rather than letting a wedged probe run unbounded.
    pub async fn scan(&self) -> LanDeviceScan {
        self.scan_with(|| {
            Box::pin(async {
                match tokio::time::timeout(SCAN_TIMEOUT, rove_core::devices::scan()).await {
                    Ok(scan) => scan,
                    Err(_) => {
                        tracing::warn!(
                            timeout_s = SCAN_TIMEOUT.as_secs(),
                            "device scan exceeded its time budget; returning empty result"
                        );
                        LanDeviceScan {
                            devices: Vec::new(),
                            subnet: None,
                            interface_name: None,
                            scanned_at: rove_core::net_util::now_ms(),
                            dhcp_status: "unavailable",
                        }
                    }
                }
            })
        })
        .await
    }

    /// The dedupe machinery, parameterised over the scan producer so tests can
    /// substitute a counted stub for the real (subprocess-heavy) `scan()`. The
    /// producer runs only when no scan is in flight.
    async fn scan_with<F>(&self, produce: F) -> LanDeviceScan
    where
        F: FnOnce() -> std::pin::Pin<Box<dyn std::future::Future<Output = LanDeviceScan> + Send>>,
    {
        let (id, fut) = {
            let mut guard = self.inflight.lock().await;
            if let Some((id, fut)) = guard.as_ref() {
                (*id, fut.clone())
            } else {
                let id = self.next_id.fetch_add(1, Ordering::Relaxed);
                let fut: SharedScan = produce().shared();
                *guard = Some((id, fut.clone()));
                (id, fut)
            }
        };

        let result = fut.await;

        // Clear the slot so the next caller starts a fresh scan — but only if it
        // still holds the future we just awaited. A newer scan may already have
        // replaced it, in which case leave that one alone.
        let mut guard = self.inflight.lock().await;
        if guard.as_ref().map(|(id, _)| *id) == Some(id) {
            *guard = None;
        }
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;
    use std::sync::Arc;
    use std::time::Duration;

    fn canned_scan() -> LanDeviceScan {
        LanDeviceScan {
            devices: Vec::new(),
            subnet: None,
            interface_name: None,
            scanned_at: 0,
            dhcp_status: "unavailable",
        }
    }

    /// Overlapping callers must coalesce onto one underlying scan. This is the
    /// property that stops the ping-subprocess storm from multiplying.
    #[tokio::test]
    async fn overlapping_scans_run_once() {
        const N: usize = 32;
        let scanner = Arc::new(DeviceScanner::default());
        let runs = Arc::new(AtomicUsize::new(0));
        // Release all callers at the same instant so they genuinely overlap.
        let gate = Arc::new(tokio::sync::Barrier::new(N));

        let mut handles = Vec::with_capacity(N);
        for _ in 0..N {
            let scanner = scanner.clone();
            let runs = runs.clone();
            let gate = gate.clone();
            handles.push(tokio::spawn(async move {
                gate.wait().await;
                scanner
                    .scan_with(|| {
                        let runs = runs.clone();
                        Box::pin(async move {
                            runs.fetch_add(1, Ordering::SeqCst);
                            // Hold the scan in flight long enough that every
                            // caller arrives while it's still running.
                            tokio::time::sleep(Duration::from_millis(50)).await;
                            canned_scan()
                        })
                    })
                    .await
            }));
        }
        for h in handles {
            h.await.unwrap();
        }

        assert_eq!(
            runs.load(Ordering::SeqCst),
            1,
            "all {N} overlapping callers should share a single scan"
        );
        // The slot must be released afterwards, so a later call scans afresh.
        assert!(scanner.inflight.lock().await.is_none());
    }

    /// Non-overlapping callers must each get their own fresh scan — the guard
    /// coalesces concurrency, it does not cache results.
    #[tokio::test]
    async fn sequential_scans_each_run() {
        let scanner = DeviceScanner::default();
        let runs = Arc::new(AtomicUsize::new(0));
        for _ in 0..3 {
            let runs = runs.clone();
            scanner
                .scan_with(|| {
                    Box::pin(async move {
                        runs.fetch_add(1, Ordering::SeqCst);
                        canned_scan()
                    })
                })
                .await;
        }
        assert_eq!(runs.load(Ordering::SeqCst), 3);
    }
}
