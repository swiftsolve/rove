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
    // Each limit is None when that measure doesn't affect the activity.
    min_down: Option<f64>,
    min_up: Option<f64>,
    max_latency: Option<f64>,
    max_jitter: Option<f64>,
    /// Packet loss, in percent.
    max_loss: Option<f64>,
    /// False when a slow connection only makes it slow, so it bottoms out at
    /// "poor" instead of "unsupported".
    can_be_unsupported: bool,
}

// Each limit comes from the provider or guide named beside it; the rest are
// Rove's own rules of thumb, marked so. Buffered video and browsing set no
// latency or jitter limit: a buffer absorbs delay, and no provider names one.
// Keep in step with CAPABILITY_DEFINITIONS in src/types/capabilities.ts.
const CAPABILITY_DEFS: [CapabilityDef; 8] = [
    // Down: FCC broadband speed guide, browsing, email and social media (1 Mbps).
    CapabilityDef {
        id: "browsing",
        label: "Web browsing",
        description: "General web, email, social media",
        icon: "🌐",
        min_down: Some(1.0),
        min_up: None,
        max_latency: None,
        max_jitter: None,
        max_loss: None,
        can_be_unsupported: true,
    },
    // Down: Netflix and YouTube, 1080p (5 Mbps).
    CapabilityDef {
        id: "streaming-hd",
        label: "HD streaming",
        description: "1080p video streaming",
        icon: "📺",
        min_down: Some(5.0),
        min_up: None,
        max_latency: None,
        max_jitter: None,
        max_loss: None,
        can_be_unsupported: true,
    },
    // Down: YouTube, 4K (20 Mbps); Netflix asks for 15.
    CapabilityDef {
        id: "streaming-4k",
        label: "4K streaming",
        description: "Ultra HD video streaming",
        icon: "🎬",
        min_down: Some(20.0),
        min_up: None,
        max_latency: None,
        max_jitter: None,
        max_loss: None,
        can_be_unsupported: true,
    },
    // Down and up: Zoom, 1080p group call (3.0 down, 3.8 up). Latency, jitter
    // and loss: Microsoft Teams, client to Microsoft's edge (100 ms round trip,
    // 30 ms jitter, 1% loss).
    CapabilityDef {
        id: "video-calls",
        label: "Video calls",
        description: "Zoom, Teams, Google Meet",
        icon: "📹",
        min_down: Some(3.0),
        min_up: Some(3.8),
        max_latency: Some(100.0),
        max_jitter: Some(30.0),
        max_loss: Some(1.0),
        can_be_unsupported: true,
    },
    // Up: Twitch's 1080p60 bitrate (6,000 kbps), kept under 75% of the
    // upload so the stream has headroom (Rove's rule of thumb).
    CapabilityDef {
        id: "live-streaming",
        label: "Live streaming",
        description: "Twitch, YouTube live broadcasting",
        icon: "📡",
        min_down: None,
        min_up: Some(8.0),
        max_latency: None,
        max_jitter: None,
        max_loss: None,
        can_be_unsupported: true,
    },
    // Down: FCC broadband speed guide, online multiplayer (4 Mbps). No game
    // publishes the rest, so up, latency, jitter and loss are rules of thumb.
    CapabilityDef {
        id: "gaming",
        label: "Online gaming",
        description: "Low-latency multiplayer games",
        icon: "🎮",
        min_down: Some(4.0),
        min_up: Some(2.0),
        max_latency: Some(50.0),
        max_jitter: Some(15.0),
        max_loss: Some(1.0),
        can_be_unsupported: true,
    },
    // Down and latency: GeForce NOW, 1080p at 60 fps (25 Mbps), under 40 ms
    // recommended. It requires under 80 ms, where `rate` calls it unsupported.
    // Up, jitter and loss are rules of thumb.
    CapabilityDef {
        id: "cloud-gaming",
        label: "Cloud gaming",
        description: "GeForce NOW, Xbox Cloud",
        icon: "☁️",
        min_down: Some(25.0),
        min_up: Some(3.0),
        max_latency: Some(40.0),
        max_jitter: Some(10.0),
        max_loss: Some(1.0),
        can_be_unsupported: true,
    },
    // Down: the FCC's broadband benchmark (100 Mbps), a 100 GB game in about two
    // hours. Only download speed sets how long a download takes; the upload
    // just carries its acknowledgements. A slow line still downloads, so never
    // unsupported.
    CapabilityDef {
        id: "large-downloads",
        label: "Large downloads",
        description: "Game updates, file transfers",
        icon: "⬇️",
        min_down: Some(100.0),
        min_up: None,
        max_latency: None,
        max_jitter: None,
        max_loss: None,
        can_be_unsupported: false,
    },
];

/// How far one measure is from its limit, worst last so the worst one wins.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum Band {
    Meets,
    Fair,
    Poor,
    Unusable,
}

// A speed or delay within half again of its limit is fair; past double, unusable.
const FAIR_FACTOR: f64 = 1.5;
const UNUSABLE_FACTOR: f64 = 2.0;
// The test's ten pings measure loss in 10% steps, so one lost ping (10% against
// a 1% limit) is fair, two poor, and three or more unusable.
const LOSS_FAIR_FACTOR: f64 = 10.0;
const LOSS_UNUSABLE_FACTOR: f64 = 20.0;

/// The band for `factor`, how many times over its limit a measure is (1 or
/// less meets it).
fn band(factor: f64, fair_factor: f64, unusable_factor: f64) -> Band {
    if factor <= 1.0 {
        Band::Meets
    } else if factor <= fair_factor {
        Band::Fair
    } else if factor <= unusable_factor {
        Band::Poor
    } else {
        Band::Unusable
    }
}

/// `rateCapability` in `src/bridge/mock-network-api.ts` mirrors this by hand, so
/// demo ratings match; change both together.
fn rate(speed: &SpeedResult, def: &CapabilityDef) -> &'static str {
    // A speed falls short by its limit over the measure; a delay or loss by the
    // measure over its limit.
    let bands = [
        def.min_down.map(|limit| band(limit / speed.download_mbps, FAIR_FACTOR, UNUSABLE_FACTOR)),
        def.min_up.map(|limit| band(limit / speed.upload_mbps, FAIR_FACTOR, UNUSABLE_FACTOR)),
        def.max_latency.map(|limit| band(speed.latency_ms / limit, FAIR_FACTOR, UNUSABLE_FACTOR)),
        def.max_jitter.map(|limit| band(speed.jitter_ms / limit, FAIR_FACTOR, UNUSABLE_FACTOR)),
        def.max_loss.map(|limit| band(speed.packet_loss / limit, LOSS_FAIR_FACTOR, LOSS_UNUSABLE_FACTOR)),
    ];
    let worst = bands.into_iter().flatten().max().unwrap_or(Band::Meets);
    match worst {
        Band::Unusable if def.can_be_unsupported => "unsupported",
        Band::Unusable | Band::Poor => "poor",
        Band::Fair => "fair",
        Band::Meets => {
            // Excellent: twice each speed it needs, and half its latency limit.
            let has_speed_headroom = def.min_down.is_none_or(|limit| speed.download_mbps >= limit * 2.0)
                && def.min_up.is_none_or(|limit| speed.upload_mbps >= limit * 2.0);
            let has_latency_headroom = def.max_latency.is_none_or(|limit| speed.latency_ms <= limit * 0.5);
            if has_speed_headroom && has_latency_headroom {
                "excellent"
            } else {
                "good"
            }
        }
    }
}

pub fn assess(speed: &SpeedResult) -> Vec<CapabilityRating> {
    CAPABILITY_DEFS
        .iter()
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

    fn with_loss(speed: SpeedResult, packet_loss: f64) -> SpeedResult {
        SpeedResult { packet_loss, ..speed }
    }

    fn level(id: &str, speed: &SpeedResult) -> String {
        assess(speed).into_iter().find(|rating| rating.id == id).unwrap().level
    }

    /// Too slow only ever makes a download slow, so it bottoms out at poor.
    #[test]
    fn large_downloads_are_never_unsupported() {
        assert_eq!(level("large-downloads", &speed(20.0, 1.0, 30.0, 5.0)), "poor");
        assert_eq!(level("large-downloads", &speed(80.0, 1.0, 30.0, 5.0)), "fair");
        assert_eq!(level("large-downloads", &speed(200.0, 1.0, 30.0, 5.0)), "excellent");
    }

    /// A buffer absorbs delay, so a satellite link streams and browses at full speed.
    #[test]
    fn buffered_video_and_browsing_ignore_latency() {
        let satellite = speed(150.0, 3.0, 600.0, 80.0);
        assert_eq!(level("streaming-4k", &satellite), "excellent");
        assert_eq!(level("browsing", &satellite), "excellent");
        assert_eq!(level("large-downloads", &satellite), "good");
        assert_eq!(level("video-calls", &satellite), "unsupported");
    }

    /// A fast download doesn't rescue a call or a stream that can't send.
    #[test]
    fn a_short_upload_sets_the_rating() {
        let weak_upload = speed(120.0, 1.5, 20.0, 5.0);
        assert_eq!(level("video-calls", &weak_upload), "unsupported");
        assert_eq!(level("live-streaming", &weak_upload), "unsupported");
        assert_eq!(level("video-calls", &speed(120.0, 3.0, 20.0, 5.0)), "fair");
    }

    /// Ten pings measure loss in 10% steps: one lost is fair, three unusable.
    #[test]
    fn packet_loss_rates_calls_and_games() {
        let clean = speed(120.0, 20.0, 20.0, 5.0);
        assert_eq!(level("video-calls", &clean), "excellent");
        assert_eq!(level("video-calls", &with_loss(speed(120.0, 20.0, 20.0, 5.0), 10.0)), "fair");
        assert_eq!(level("video-calls", &with_loss(speed(120.0, 20.0, 20.0, 5.0), 20.0)), "poor");
        assert_eq!(level("gaming", &with_loss(speed(120.0, 20.0, 20.0, 5.0), 30.0)), "unsupported");
        assert_eq!(level("streaming-4k", &with_loss(speed(120.0, 20.0, 20.0, 5.0), 30.0)), "excellent");
    }
}
