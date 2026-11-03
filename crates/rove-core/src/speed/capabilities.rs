//! What a speed-test result is good enough for: 4K, video calls, cloud gaming…
use crate::speed::SpeedResult;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityRating {
    pub id: String,
    pub label: String,
    pub description: String,
    pub icon: String,
    pub level: String,
}

struct CapabilityDef {
    id: &'static str,
    label: &'static str,
    description: &'static str,
    icon: &'static str,
    min_down: f64,
    min_up: f64,
    /// None when latency doesn't affect it.
    max_latency: Option<f64>,
    /// None when jitter doesn't affect it.
    max_jitter: Option<f64>,
    /// False when a slow connection only makes it slow, so it bottoms out at
    /// "poor" instead of "unsupported".
    can_be_unsupported: bool,
}

// Each speed comes from the provider or guide named beside it. Providers
// don't publish latency or jitter limits (bar GeForce NOW's latency), and few
// publish upload, so those are Rove's own rules of thumb unless noted. Keep in
// step with CAPABILITY_DEFINITIONS in src/types/capabilities.ts.
const CAPABILITY_DEFS: [CapabilityDef; 8] = [
    // Down: FCC broadband speed guide, browsing, email and social media (1 Mbps).
    CapabilityDef { id: "browsing", label: "Web Browsing", description: "General web, email, social media", icon: "🌐", min_down: 1.0, min_up: 1.0, max_latency: Some(100.0), max_jitter: Some(30.0), can_be_unsupported: true },
    // Down: Netflix and YouTube, 1080p (5 Mbps).
    CapabilityDef { id: "streaming-hd", label: "HD Streaming", description: "1080p video streaming", icon: "📺", min_down: 5.0, min_up: 1.0, max_latency: Some(100.0), max_jitter: Some(30.0), can_be_unsupported: true },
    // Down: YouTube, 4K (20 Mbps); Netflix asks for 15.
    CapabilityDef { id: "streaming-4k", label: "4K Streaming", description: "Ultra HD video streaming", icon: "🎬", min_down: 20.0, min_up: 2.0, max_latency: Some(80.0), max_jitter: Some(20.0), can_be_unsupported: true },
    // Down and up: Zoom, 1080p group call (3.0 down, 3.8 up).
    CapabilityDef { id: "video-calls", label: "Video Calls", description: "Zoom, Teams, Google Meet", icon: "📹", min_down: 3.0, min_up: 3.8, max_latency: Some(150.0), max_jitter: Some(30.0), can_be_unsupported: true },
    // Up: Twitch's 1080p60 bitrate (6,000 kbps).
    CapabilityDef { id: "live-streaming", label: "Live Streaming", description: "Twitch, YouTube live broadcasting", icon: "📡", min_down: 5.0, min_up: 6.0, max_latency: Some(100.0), max_jitter: Some(30.0), can_be_unsupported: true },
    // Down: FCC broadband speed guide, online multiplayer (4 Mbps).
    CapabilityDef { id: "gaming", label: "Online Gaming", description: "Low-latency multiplayer games", icon: "🎮", min_down: 4.0, min_up: 2.0, max_latency: Some(50.0), max_jitter: Some(15.0), can_be_unsupported: true },
    // Down and latency: GeForce NOW, 1080p at 60 fps (25 Mbps), under 40 ms
    // recommended. It requires under 80 ms, where `rate` calls it unsupported.
    CapabilityDef { id: "cloud-gaming", label: "Cloud Gaming", description: "GeForce NOW, Xbox Cloud", icon: "☁️", min_down: 25.0, min_up: 3.0, max_latency: Some(40.0), max_jitter: Some(10.0), can_be_unsupported: true },
    // Down: the FCC's broadband benchmark (100 Mbps), a 100 GB game in about two
    // hours. Only download speed sets how long a download takes, so there's no
    // latency or jitter limit, and the upload just carries its acknowledgements
    // (1-2% of the download). A slow line still downloads, so never unsupported.
    CapabilityDef { id: "large-downloads", label: "Large Downloads", description: "Game updates, file transfers", icon: "⬇️", min_down: 100.0, min_up: 1.0, max_latency: None, max_jitter: None, can_be_unsupported: false },
];

/// Whether `value` is within `limit` scaled by `factor`; no limit always is.
fn within(value: f64, limit: Option<f64>, factor: f64) -> bool {
    limit.is_none_or(|limit| value <= limit * factor)
}

/// `rateCapability` in `src/dev/mock-network-api.ts` mirrors this by hand, so
/// demo ratings match; change both together.
fn rate(speed: &SpeedResult, def: &CapabilityDef) -> &'static str {
    let is_unusable = speed.download_mbps < def.min_down * 0.5 || !within(speed.latency_ms, def.max_latency, 2.0);
    if def.can_be_unsupported && is_unusable {
        return "unsupported";
    }
    let meets = speed.download_mbps >= def.min_down
        && speed.upload_mbps >= def.min_up
        && within(speed.latency_ms, def.max_latency, 1.0)
        && within(speed.jitter_ms, def.max_jitter, 1.0);
    if meets {
        let excellent =
            speed.download_mbps >= def.min_down * 2.0 && within(speed.latency_ms, def.max_latency, 0.5);
        return if excellent { "excellent" } else { "good" };
    }
    if speed.download_mbps >= def.min_down * 0.7 {
        "fair"
    } else {
        "poor"
    }
}

pub fn assess(speed: &SpeedResult) -> Vec<CapabilityRating> {
    CAPABILITY_DEFS.iter()
        .map(|def| CapabilityRating {
            id: def.id.into(),
            label: def.label.into(),
            description: def.description.into(),
            icon: def.icon.into(),
            level: rate(speed, def).into(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn speed(down: f64, up: f64, latency: f64, jitter: f64) -> SpeedResult {
        SpeedResult { download_mbps: down, upload_mbps: up, latency_ms: latency, jitter_ms: jitter, packet_loss: 0.0 }
    }

    fn level(id: &str, speed: &SpeedResult) -> String {
        assess(speed).into_iter().find(|rating| rating.id == id).unwrap().level
    }

    /// A geostationary satellite link: high latency, but downloads run at full speed.
    #[test]
    fn large_downloads_ignore_latency_and_jitter() {
        assert_eq!(level("large-downloads", &speed(150.0, 3.0, 600.0, 80.0)), "good");
        assert_eq!(level("cloud-gaming", &speed(150.0, 3.0, 600.0, 80.0)), "unsupported");
    }

    /// Too slow only ever makes a download slow, so it bottoms out at poor.
    #[test]
    fn large_downloads_are_never_unsupported() {
        assert_eq!(level("large-downloads", &speed(20.0, 1.0, 30.0, 5.0)), "poor");
        assert_eq!(level("large-downloads", &speed(80.0, 1.0, 30.0, 5.0)), "fair");
        assert_eq!(level("large-downloads", &speed(200.0, 1.0, 30.0, 5.0)), "excellent");
    }

    #[test]
    fn other_capabilities_keep_their_unsupported_floor() {
        assert_eq!(level("streaming-4k", &speed(8.0, 5.0, 20.0, 2.0)), "unsupported");
    }
}
