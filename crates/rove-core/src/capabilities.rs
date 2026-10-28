use crate::types::{CapabilityRating, SpeedResult};

struct Def {
    id: &'static str,
    label: &'static str,
    description: &'static str,
    icon: &'static str,
    min_down: f64,
    min_up: f64,
    max_latency: f64,
    max_jitter: f64,
}

// Each speed comes from the provider or guide named beside it. Providers
// don't publish latency or jitter limits (bar GeForce NOW's latency), and few
// publish upload, so those are Rove's own rules of thumb unless noted. Keep in
// step with CAPABILITY_DEFINITIONS in src/types/capabilities.ts.
const DEFS: [Def; 8] = [
    // Down: FCC broadband speed guide, browsing, email and social media (1 Mbps).
    Def { id: "browsing", label: "Web Browsing", description: "General web, email, social media", icon: "🌐", min_down: 1.0, min_up: 1.0, max_latency: 100.0, max_jitter: 30.0 },
    // Down: Netflix and YouTube, 1080p (5 Mbps).
    Def { id: "streaming-hd", label: "HD Streaming", description: "1080p video streaming", icon: "📺", min_down: 5.0, min_up: 1.0, max_latency: 100.0, max_jitter: 30.0 },
    // Down: YouTube, 4K (20 Mbps); Netflix asks for 15.
    Def { id: "streaming-4k", label: "4K Streaming", description: "Ultra HD video streaming", icon: "🎬", min_down: 20.0, min_up: 2.0, max_latency: 80.0, max_jitter: 20.0 },
    // Down and up: Zoom, 1080p group call (3.0 down, 3.8 up).
    Def { id: "video-calls", label: "Video Calls", description: "Zoom, Teams, Google Meet", icon: "📹", min_down: 3.0, min_up: 3.8, max_latency: 150.0, max_jitter: 30.0 },
    // Up: Twitch's 1080p60 bitrate (6,000 kbps).
    Def { id: "live-streaming", label: "Live Streaming", description: "Twitch, YouTube live broadcasting", icon: "📡", min_down: 5.0, min_up: 6.0, max_latency: 100.0, max_jitter: 30.0 },
    // Down: FCC broadband speed guide, online multiplayer (4 Mbps).
    Def { id: "gaming", label: "Online Gaming", description: "Low-latency multiplayer games", icon: "🎮", min_down: 4.0, min_up: 2.0, max_latency: 50.0, max_jitter: 15.0 },
    // Down and latency: GeForce NOW, 1080p at 60 fps (25 Mbps), under 40 ms
    // recommended. It requires under 80 ms, where `rate` calls it unsupported.
    Def { id: "cloud-gaming", label: "Cloud Gaming", description: "GeForce NOW, Xbox Cloud", icon: "☁️", min_down: 25.0, min_up: 3.0, max_latency: 40.0, max_jitter: 10.0 },
    // No provider figure: Rove's own, a 10 GB game update in under half an hour.
    Def { id: "large-downloads", label: "Large Downloads", description: "Game updates, file transfers", icon: "⬇️", min_down: 50.0, min_up: 2.0, max_latency: 200.0, max_jitter: 50.0 },
];

fn rate(speed: &SpeedResult, def: &Def) -> &'static str {
    if speed.download_mbps < def.min_down * 0.5 || speed.latency_ms > def.max_latency * 2.0 {
        return "unsupported";
    }
    let meets = speed.download_mbps >= def.min_down
        && speed.upload_mbps >= def.min_up
        && speed.latency_ms <= def.max_latency
        && speed.jitter_ms <= def.max_jitter;
    if meets {
        let excellent =
            speed.download_mbps >= def.min_down * 2.0 && speed.latency_ms <= def.max_latency * 0.5;
        return if excellent { "excellent" } else { "good" };
    }
    if speed.download_mbps >= def.min_down * 0.7 {
        "fair"
    } else {
        "poor"
    }
}

pub fn assess(speed: &SpeedResult) -> Vec<CapabilityRating> {
    DEFS.iter()
        .map(|def| CapabilityRating {
            id: def.id.into(),
            label: def.label.into(),
            description: def.description.into(),
            icon: def.icon.into(),
            level: rate(speed, def).into(),
        })
        .collect()
}
