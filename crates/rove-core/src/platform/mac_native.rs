//! macOS Wi-Fi facts the shell tools no longer give.
//!
//! Since macOS 14 every command-line tool (`airport`, `networksetup`,
//! `system_profiler`, `ipconfig`) prints `<redacted>` for the SSID unless the
//! calling app holds Location Services permission, and a child process doesn't
//! inherit it. So the SSID is read in-process: authorise via CoreLocation, then
//! ask CoreWLAN. Off macOS everything here returns `None`.

#[cfg(target_os = "macos")]
mod imp {
    use objc2_core_location::{CLAuthorizationStatus, CLLocationManager};
    use objc2_core_wlan::CWWiFiClient;

    /// Trigger the Location Services prompt, returning the current status for logging.
    ///
    /// Needs `NSLocationWhenInUseUsageDescription` in Info.plist. Called once at
    /// startup, on the main thread, which CoreLocation asserts. The manager is
    /// leaked so it outlives the async authorisation.
    pub fn request_location_permission() -> &'static str {
        // SAFETY: plain CoreLocation init on the main thread; the manager is
        // leaked on purpose so the authorisation can complete.
        unsafe {
            let manager = CLLocationManager::new();
            manager.requestWhenInUseAuthorization();
            let status = status_label(manager.authorizationStatus());
            std::mem::forget(manager);
            status
        }
    }

    fn status_label(status: CLAuthorizationStatus) -> &'static str {
        match status {
            CLAuthorizationStatus::NotDetermined => "prompt",
            CLAuthorizationStatus::Restricted | CLAuthorizationStatus::Denied => "denied",
            CLAuthorizationStatus::AuthorizedAlways | CLAuthorizationStatus::AuthorizedWhenInUse => "granted",
            _ => "unknown",
        }
    }

    /// The SSID of the default Wi-Fi interface, or `None` when there's no Wi-Fi,
    /// we're not associated, or Location access hasn't been granted yet.
    pub fn current_ssid() -> Option<String> {
        // SAFETY: CoreWLAN accessors; each returns null when unavailable, which
        // the `?`/Option chain turns into `None`.
        unsafe {
            let client = CWWiFiClient::sharedWiFiClient();
            let interface = client.interface()?;
            let ssid = interface.ssid()?;
            let name = ssid.to_string();
            (!name.is_empty()).then_some(name)
        }
    }

    /// Current Wi-Fi transmit rate in Mbps, or `None` when not associated.
    ///
    /// `ifconfig` shows Wi-Fi media as a bare "autoselect", so this is the
    /// interface list's only Wi-Fi link speed. Not gated by Location Services.
    /// The accessor returns 0 when not associated.
    pub fn wifi_tx_rate() -> Option<i64> {
        // SAFETY: CoreWLAN accessors; `interface()` is null with no Wi-Fi.
        unsafe {
            let client = CWWiFiClient::sharedWiFiClient();
            let interface = client.interface()?;
            let rate = interface.transmitRate();
            (rate > 0.0).then_some(rate as i64)
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod imp {
    pub fn request_location_permission() -> &'static str {
        "n/a (not macOS)"
    }
    pub fn current_ssid() -> Option<String> {
        None
    }
    pub fn wifi_tx_rate() -> Option<i64> {
        None
    }
}

pub use imp::*;
