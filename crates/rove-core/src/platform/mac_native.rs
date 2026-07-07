//! macOS-native Wi-Fi bits that shell tools can't provide.
//!
//! Since macOS 14 the current SSID is withheld from every command-line tool
//! (`airport`, `networksetup`, `system_profiler`, `ipconfig` all return
//! `<redacted>`) unless the *calling application* holds Location Services
//! authorization. A shelled-out child doesn't inherit that grant, so the SSID
//! has to be requested in-process: authorize via CoreLocation, then read it via
//! CoreWLAN. Everything here no-ops to `None` off macOS.

#[cfg(target_os = "macos")]
mod imp {
    use objc2_core_location::{CLAuthorizationStatus, CLLocationManager};
    use objc2_core_wlan::CWWiFiClient;

    /// Trigger the Location Services prompt (needs `NSLocationWhenInUseUsage-
    /// Description` in Info.plist). Called once at startup; the manager is leaked
    /// so it outlives the async authorization round-trip. Must run on the main
    /// thread — CoreLocation asserts otherwise. Returns the current authorization
    /// status for logging.
    pub fn request_location_permission() -> &'static str {
        // SAFETY: standard AppKit init; the object is intentionally kept alive
        // for the lifetime of the process so the authorization can complete.
        unsafe {
            let manager = CLLocationManager::new();
            manager.requestWhenInUseAuthorization();
            let status = simplify(manager.authorizationStatus());
            std::mem::forget(manager);
            status
        }
    }

    fn simplify(status: CLAuthorizationStatus) -> &'static str {
        match status {
            CLAuthorizationStatus::NotDetermined => "prompt",
            CLAuthorizationStatus::Restricted | CLAuthorizationStatus::Denied => "denied",
            CLAuthorizationStatus::AuthorizedAlways
            | CLAuthorizationStatus::AuthorizedWhenInUse => "granted",
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

    /// Current Wi-Fi transmit rate in Mbps, read in-process via CoreWLAN.
    /// `ifconfig` reports Wi-Fi media only as "autoselect" with no rate, so this
    /// is the interface list's only source of link speed for Wi-Fi. Unlike the
    /// SSID, the transmit rate isn't gated behind Location Services. Returns
    /// `None` with no associated Wi-Fi (the accessor yields 0).
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
