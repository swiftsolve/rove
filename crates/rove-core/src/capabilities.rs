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

const DEFS: [Def; 8] = [
    Def { id: "browsing", label: "Web Browsing", description: "General web, email, social media", icon: "🌐", min_down: 5.0, min_up: 1.0, max_latency: 100.0, max_jitter: 30.0 },
    Def { id: "streaming-hd", label: "HD Streaming", description: "1080p video streaming", icon: "📺", min_down: 5.0, min_up: 1.0, max_latency: 100.0, max_jitter: 30.0 },
    Def { id: "streaming-4k", label: "4K Streaming", description: "Ultra HD video streaming", icon: "🎬", min_down: 25.0, min_up: 2.0, max_latency: 80.0, max_jitter: 20.0 },
    Def { id: "video-calls", label: "Video Calls", description: "Zoom, Teams, Google Meet", icon: "📹", min_down: 5.0, min_up: 4.0, max_latency: 150.0, max_jitter: 30.0 },
    Def { id: "gaming", label: "Online Gaming", description: "Low-latency multiplayer games", icon: "🎮", min_down: 5.0, min_up: 2.0, max_latency: 50.0, max_jitter: 15.0 },
    Def { id: "cloud-gaming", label: "Cloud Gaming", description: "GeForce NOW, Xbox Cloud", icon: "☁️", min_down: 25.0, min_up: 3.0, max_latency: 40.0, max_jitter: 10.0 },
    Def { id: "large-downloads", label: "Large Downloads", description: "Game updates, file transfers", icon: "⬇️", min_down: 50.0, min_up: 2.0, max_latency: 200.0, max_jitter: 50.0 },
    Def { id: "live-streaming", label: "Live Streaming", description: "Twitch, YouTube live broadcasting", icon: "📡", min_down: 5.0, min_up: 6.0, max_latency: 100.0, max_jitter: 30.0 },
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
