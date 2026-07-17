//! mDNS service discovery — devices advertise what they are, which beats
//! any vendor-table guessing. Pure Rust (mdns-sd), cross-platform.
use mdns_sd::{ServiceDaemon, ServiceEvent};
use std::collections::HashMap;
use std::time::Duration;

/// What a service type says about the device kind, strongest signal first.
/// (service, kind, strong). Strong types state the kind outright; weak ones
/// (AirPlay/AirTunes/Spotify) run on TVs *and* computers, so they only apply
/// when nothing better is known — the TXT model record usually settles it.
const SERVICE_KINDS: &[(&str, &str, bool)] = &[
    ("_ipp._tcp.local.", "printer", true),
    ("_ipps._tcp.local.", "printer", true),
    ("_printer._tcp.local.", "printer", true),
    ("_pdl-datastream._tcp.local.", "printer", true),
    ("_scanner._tcp.local.", "printer", true),
    ("_uscan._tcp.local.", "printer", true),
    ("_uscans._tcp.local.", "printer", true),
    ("_googlecast._tcp.local.", "tv", true),
    ("_androidtvremote2._tcp.local.", "tv", true),
    ("_androidtvremote._tcp.local.", "tv", true),
    ("_roku-rcp._tcp.local.", "tv", true),
    ("_nvstream._tcp.local.", "tv", true),
    ("_hap._tcp.local.", "iot", true),
    ("_matter._tcp.local.", "iot", true),
    ("_esphomelib._tcp.local.", "iot", true),
    ("_shelly._tcp.local.", "iot", true),
    ("_hue._tcp.local.", "iot", true),
    ("_ewelink._tcp.local.", "iot", true),
    ("_wled._tcp.local.", "iot", true),
    ("_elg._tcp.local.", "iot", true),
    ("_octoprint._tcp.local.", "printer", true),
    ("_sonos._tcp.local.", "speaker", true),
    ("_soundtouch._tcp.local.", "speaker", true),
    ("_axis-video._tcp.local.", "camera", true),
    ("_workstation._tcp.local.", "computer", true),
    ("_smb._tcp.local.", "computer", true),
    ("_afpovertcp._tcp.local.", "computer", true),
    ("_sftp-ssh._tcp.local.", "computer", true),
    ("_raop._tcp.local.", "tv", false),
    ("_airplay._tcp.local.", "tv", false),
    ("_spotify-connect._tcp.local.", "tv", false),
    ("_amzn-wplay._tcp.local.", "tv", false),
    ("_ssh._tcp.local.", "computer", false),
    ("_daap._tcp.local.", "computer", false),
    ("_rfb._tcp.local.", "computer", false),
];

#[derive(Debug, Clone, Default)]
pub struct MdnsHit {
    /// Friendly device name (TXT `fn`/`md` or the service instance name).
    pub name: Option<String>,
    /// Definite kind from a strong service type.
    pub kind: Option<&'static str>,
    /// Fallback kind from a weak service type (AirPlay et al).
    pub kind_hint: Option<&'static str>,
    /// Hardware model from TXT (`am`/`model`/`md`), e.g. "MacBookPro18,3".
    pub model: Option<String>,
    /// Host advertises `_spotify-connect._tcp`. On its own this is a weak TV/
    /// speaker hint (many devices are Spotify endpoints), but combined with an
    /// Amazon OUI it fingerprints an Echo — see the caller in `devices::mod`.
    pub spotify_connect: bool,
}

impl MdnsHit {
    /// Fold another observation of the same device into this one, using the same
    /// rule as the within-window merge in [`discover`]: the strongest (lowest
    /// `kind_rank`) strong kind wins, and every other field fills a gap it
    /// doesn't already hold. Lets the scanner accumulate a device's mDNS
    /// identity across scans so a service seen once isn't lost when a later,
    /// lossy discovery window misses it.
    pub(crate) fn absorb(&mut self, other: &MdnsHit) {
        if let Some(kind) = other.kind {
            let better = self.kind.map(|current| kind_rank(kind) < kind_rank(current)).unwrap_or(true);
            if better {
                self.kind = Some(kind);
            }
        }
        if self.kind_hint.is_none() {
            self.kind_hint = other.kind_hint;
        }
        if self.name.is_none() {
            self.name = other.name.clone();
        }
        if self.model.is_none() {
            self.model = other.model.clone();
        }
        self.spotify_connect |= other.spotify_connect;
    }
}

/// Instance names that are the *service* brand rather than the device — an
/// Amazon Echo advertises `_spotify-connect._tcp` as the literal "SpotifyConnect".
/// Reject these so the device falls back to a real name (vendor/hostname) instead
/// of a service label; a user-renamed endpoint ("Kitchen") won't match.
fn is_generic_service_name(name: &str) -> bool {
    let compact: String =
        name.chars().filter(|c| !c.is_whitespace()).collect::<String>().to_ascii_lowercase();
    matches!(compact.as_str(), "spotifyconnect")
}

/// Names like "0,1,2" or "16A9B57BB77..." are IDs, not names.
fn is_human_name(name: &str) -> bool {
    if name.len() > 32 || !name.chars().any(|c| c.is_ascii_alphabetic()) {
        return false;
    }
    let compact: String = name.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    !(compact.len() >= 16 && compact.chars().all(|c| c.is_ascii_hexdigit()))
}

/// Google Cast's `_googlecast._tcp` service is shared by video devices
/// (Chromecast, Nest Hub, Android TV) and audio-only ones (Nest Mini/Audio and
/// smart-clock speakers), so the bare service type can't tell a TV from a
/// speaker — every Cast device would otherwise read as "tv".
///
/// The TXT `ca` capabilities bitmask settles it: bit 0 is video-out, bit 2 is
/// audio-out. A device that outputs audio but not video is a speaker; anything
/// with video output — or an unreadable `ca` — keeps the historical "tv"
/// default so nothing regresses. `md` is an opaque codename on many units (a
/// Lenovo Smart Clock reports `LenovoCD-24502F`, not a marketing name), so it's
/// only a keyword fallback for the rare device that omits `ca`.
fn refine_cast_kind(ca: Option<u32>, model: Option<&str>) -> &'static str {
    const VIDEO_OUT: u32 = 0x01;
    const AUDIO_OUT: u32 = 0x04;
    if let Some(ca) = ca {
        if ca & VIDEO_OUT != 0 {
            return "tv";
        }
        if ca & AUDIO_OUT != 0 {
            return "speaker";
        }
    }
    // No usable `ca`: match only unambiguous audio-device names, so a codename or
    // a video model can't be mistyped as a speaker. Everything else stays "tv".
    if let Some(model) = model {
        let m = model.to_ascii_lowercase();
        const SPEAKER_HINTS: &[&str] = &[
            "nest mini",
            "nest audio",
            "chromecast audio",
            "google home mini",
            "google home max",
            "homepod",
            "speaker",
        ];
        if SPEAKER_HINTS.iter().any(|hint| m.contains(hint)) {
            return "speaker";
        }
    }
    "tv"
}

fn kind_rank(kind: &str) -> u8 {
    match kind {
        "printer" => 0,
        "camera" => 1,
        "speaker" => 2,
        "nas" => 3,
        "iot" => 4,
        "computer" => 5, // beats tv: a Mac advertising AirPlay is a computer
        "tv" => 6,
        _ => 9,
    }
}

fn instance_name(fullname: &str) -> Option<String> {
    let mut name = fullname.split("._").next()?.replace("\\032", " ").replace("%20", " ");
    // AirTunes instances are "MACADDRESS@Room Name" — keep the human half.
    if let Some((_, suffix)) = name.split_once('@') {
        name = suffix.to_string();
    }
    (!name.is_empty() && name.len() > 1).then_some(name)
}

/// Browse the known service types for `window` and map results by IPv4.
pub async fn discover(window: Duration) -> HashMap<String, MdnsHit> {
    tokio::task::spawn_blocking(move || discover_blocking(window))
        .await
        .unwrap_or_default()
}

fn discover_blocking(window: Duration) -> HashMap<String, MdnsHit> {
    let Ok(daemon) = ServiceDaemon::new() else {
        return HashMap::new();
    };

    let receivers: Vec<_> = SERVICE_KINDS
        .iter()
        .filter_map(|(service, kind, strong)| {
            daemon.browse(service).ok().map(|rx| (rx, *service, *kind, *strong))
        })
        .collect();

    let deadline = std::time::Instant::now() + window;
    let mut hits: HashMap<String, MdnsHit> = HashMap::new();

    loop {
        let now = std::time::Instant::now();
        if now >= deadline {
            break;
        }
        let mut got_any = false;

        for (rx, service, kind, strong) in &receivers {
            let is_spotify = *service == "_spotify-connect._tcp.local.";
            while let Ok(event) = rx.try_recv() {
                got_any = true;
                let ServiceEvent::ServiceResolved(info) = event else {
                    continue;
                };
                let name = info
                    .get_property_val_str("fn")
                    .map(String::from)
                    .or_else(|| instance_name(info.get_fullname()))
                    .map(|n| crate::net_util::sanitize_display(&n))
                    .filter(|n| is_human_name(n) && !is_generic_service_name(n));
                let model = info
                    .get_property_val_str("am")
                    .or_else(|| info.get_property_val_str("model"))
                    .or_else(|| info.get_property_val_str("md"))
                    .map(crate::net_util::sanitize_display)
                    .filter(|m| !m.is_empty());

                // A Cast device's service alone means only "castable"; its `ca`
                // capabilities decide TV vs. speaker (see `refine_cast_kind`).
                let effective_kind: &'static str = if *service == "_googlecast._tcp.local." {
                    let ca = info
                        .get_property_val_str("ca")
                        .and_then(|s| s.trim().parse::<u32>().ok());
                    refine_cast_kind(ca, model.as_deref())
                } else {
                    kind
                };

                for addr in info.get_addresses() {
                    if !addr.is_ipv4() {
                        continue;
                    }
                    let entry = hits.entry(addr.to_string()).or_default();
                    if *strong {
                        let better = entry
                            .kind
                            .map(|current| kind_rank(effective_kind) < kind_rank(current))
                            .unwrap_or(true);
                        if better {
                            entry.kind = Some(effective_kind);
                        }
                    } else if entry.kind_hint.is_none() {
                        entry.kind_hint = Some(effective_kind);
                    }
                    if entry.name.is_none() {
                        entry.name = name.clone();
                    }
                    if entry.model.is_none() {
                        entry.model = model.clone();
                    }
                    entry.spotify_connect |= is_spotify;
                }
            }
        }

        if !got_any {
            std::thread::sleep(Duration::from_millis(100));
        }
    }

    let _ = daemon.shutdown();
    hits
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generic_service_brand_is_not_a_device_name() {
        // The Echo's `_spotify-connect` instance name — a service label, not the
        // device — must be rejected however it's spaced/cased.
        assert!(is_generic_service_name("SpotifyConnect"));
        assert!(is_generic_service_name("Spotify Connect"));
        assert!(is_generic_service_name("spotifyconnect"));
        // A user-renamed endpoint is a real name and must survive.
        assert!(!is_generic_service_name("Kitchen"));
        assert!(!is_generic_service_name("Living Room Speaker"));
    }

    #[test]
    fn cast_capabilities_split_speakers_from_tvs() {
        // The real capture from a Lenovo Smart Clock: ca=231940 has the audio-out
        // bit (0x04) set and video-out (0x01) clear — a speaker, not a TV, even
        // though its `md` codename ("LenovoCD-24502F") names nothing.
        assert_eq!(refine_cast_kind(Some(231940), Some("LenovoCD-24502F")), "speaker");
        // A Chromecast (ca=4101) sets the video-out bit — stays a TV.
        assert_eq!(refine_cast_kind(Some(4101), Some("Chromecast")), "tv");
        // A Google Home speaker (ca=2052): audio-out, no video-out.
        assert_eq!(refine_cast_kind(Some(2052), None), "speaker");
    }

    #[test]
    fn cast_without_ca_falls_back_to_model_keywords_then_tv() {
        // No `ca`: only unambiguous audio names become speakers.
        assert_eq!(refine_cast_kind(None, Some("Nest Audio")), "speaker");
        // An opaque codename with no `ca` can't be trusted as audio — stays "tv"
        // (the historical default) rather than being guessed wrong.
        assert_eq!(refine_cast_kind(None, Some("LenovoCD-24502F")), "tv");
        assert_eq!(refine_cast_kind(None, None), "tv");
    }

    #[test]
    fn spotify_connect_flag_survives_a_later_gap() {
        // The Echo fingerprint must accumulate like the other identity signals so
        // a window that misses the service doesn't erase it.
        let mut acc = MdnsHit { spotify_connect: true, ..Default::default() };
        acc.absorb(&MdnsHit::default());
        assert!(acc.spotify_connect);

        let mut acc = MdnsHit::default();
        acc.absorb(&MdnsHit { spotify_connect: true, ..Default::default() });
        assert!(acc.spotify_connect);
    }
}
