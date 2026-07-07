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
    ("_sonos._tcp.local.", "speaker", true),
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
}

/// Names like "0,1,2" or "16A9B57BB77..." are IDs, not names.
fn is_human_name(name: &str) -> bool {
    if name.len() > 32 || !name.chars().any(|c| c.is_ascii_alphabetic()) {
        return false;
    }
    let compact: String = name.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    !(compact.len() >= 16 && compact.chars().all(|c| c.is_ascii_hexdigit()))
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
            daemon.browse(service).ok().map(|rx| (rx, *kind, *strong))
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

        for (rx, kind, strong) in &receivers {
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
                    .filter(|n| is_human_name(n));
                let model = info
                    .get_property_val_str("am")
                    .or_else(|| info.get_property_val_str("model"))
                    .or_else(|| info.get_property_val_str("md"))
                    .map(crate::net_util::sanitize_display)
                    .filter(|m| !m.is_empty());

                for addr in info.get_addresses() {
                    if !addr.is_ipv4() {
                        continue;
                    }
                    let entry = hits.entry(addr.to_string()).or_default();
                    if *strong {
                        let better = entry
                            .kind
                            .map(|current| kind_rank(kind) < kind_rank(current))
                            .unwrap_or(true);
                        if better {
                            entry.kind = Some(kind);
                        }
                    } else if entry.kind_hint.is_none() {
                        entry.kind_hint = Some(kind);
                    }
                    if entry.name.is_none() {
                        entry.name = name.clone();
                    }
                    if entry.model.is_none() {
                        entry.model = model.clone();
                    }
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
