//! Scan coalescing: one in-flight LAN scan, shared by every concurrent caller.
use futures_util::future::FutureExt;
use rove_core::devices::LanDeviceScan;
use std::sync::atomic::Ordering;

type SharedScan =
    futures_util::future::Shared<std::pin::Pin<Box<dyn std::future::Future<Output = LanDeviceScan> + Send>>>;

/// Hard ceiling on one LAN scan. A healthy scan takes ~6 s; this is the
/// backstop for a wedged probe or a host that stalls enrichment. Overlapping
/// scans, the usual cause of runaway times, are prevented below.
const SCAN_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

/// Coalesces concurrent LAN scans. A scan runs up to 64 `ping` subprocesses at
/// once; a second scan started while a slow one runs doubles that and starves
/// the tokio runtime, which once made `get_network_info` time out. Overlapping
/// callers await the one in-flight scan instead.
#[derive(Default)]
pub struct DeviceScanner {
    /// The in-flight scan, or `None` when idle. The generation id lets the
    /// starter clear the slot on completion without clobbering a newer scan.
    inflight: tokio::sync::Mutex<Option<(u64, SharedScan)>>,
    next_id: std::sync::atomic::AtomicU64,
}

impl DeviceScanner {
    /// Run a scan, or join the one in flight. Sequential calls each get a fresh
    /// scan; results aren't cached. Past `SCAN_TIMEOUT` it yields an empty
    /// result.
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
                            scanned_at: rove_core::util::net::now_ms(),
                            dhcp_status: "unavailable",
                        }
                    }
                }
            })
        })
        .await
    }

    /// Parameterised over the producer so tests can count runs with a stub. The
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

        // Only if it still holds our scan; a newer one may have replaced it.
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

    /// Non-overlapping callers must each get a fresh scan: the guard coalesces
    /// concurrency, it doesn't cache.
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
