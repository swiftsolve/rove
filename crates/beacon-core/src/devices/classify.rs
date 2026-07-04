//! Best-effort device typing.
//!
//! Rather than trust the single highest-priority signal, every signal casts a
//! weighted vote and the highest-scoring kind wins. Strong signals (a
//! definitive mDNS service, a print port) carry enough weight to decide a
//! device on their own, so unambiguous cases are unchanged; the voting only
//! matters when weaker signals disagree, letting corroboration beat a lone
//! noisy guess. Role flags (gateway/self) still short-circuit outright.
use crate::mdns::MdnsHit;
use regex_lite::Regex;
use std::sync::LazyLock;

struct KindPatterns(Vec<(Regex, &'static str)>);

impl KindPatterns {
    fn new(table: &[(&str, &'static str)]) -> Self {
        Self(
            table
                .iter()
                .map(|(pattern, kind)| (Regex::new(pattern).unwrap(), *kind))
                .collect(),
        )
    }

    fn matches(&self, text: &str) -> Option<&'static str> {
        self.0
            .iter()
            .find(|(pattern, _)| pattern.is_match(text))
            .map(|(_, kind)| *kind)
    }
}

// Within a table the first matching row wins, so order rows most-specific
// first: a NAS before a generic computer, a tablet before a phone, a camera or
// speaker before generic IoT, and keep cross-kind tokens (e.g. "android-tv" vs
// a phone's "android") off the broader kind.
static HOSTNAME_KINDS: LazyLock<KindPatterns> = LazyLock::new(|| {
    KindPatterns::new(&[
        (
            r"(?i)synology|diskstation|\bqnap\b|truenas|freenas|unraid|openmediavault|\bnas\b|nas-|-nas\b|asustor|terramaster|\bdrobo\b",
            "nas",
        ),
        (
            r"(?i)macbook|imac|mac-?mini|mac-?pro|mac-?studio|\bpc\b|-pc\b|desktop|laptop|thinkpad|ideapad|optiplex|latitude|elitebook|probook|zenbook|vivobook|surface|workstation|\bnuc\b|raspberry|\brpi\b|pi-?hole|steam-?deck|ubuntu|fedora|debian|archlinux|framework|system76|-server\b|server-",
            "computer",
        ),
        (
            r"(?i)ipad|galaxy-?tab|\bsm-t\d|kindle|fire-?hd|fire-?tablet|-tablet\b|\btablet\b",
            "tablet",
        ),
        (
            r"(?i)iphone|ipod|pixel|galaxy|sm-[a-z]\d|nexus|xperia|oneplus|redmi|\bpoco\b|realme|\boppo\b|\bvivo\b|\bhonor\b|moto[- ]?[ge]|motorola|nokia-?\d|-phone\b|phone-",
            "phone",
        ),
        (
            r"(?i)\bxbox\b|playstation|\bps[45]\b|psvita|nintendo|-switch\b|switch-|\bwii\b|steam-?link",
            "console",
        ),
        (
            r"(?i)appletv|apple-tv|android-?tv|google-?tv|chromecast|nvidia-?shield|\bshield\b|firetv|fire-?tv|fire-?stick|firestick|roku|bravia|aquos|webos|\blg-?tv|samsung-?tv|\btv\b|vizio",
            "tv",
        ),
        (
            r"(?i)printer|officejet|laserjet|deskjet|\benvy\b|pixma|imageclass|maxify|workforce|ecotank|expression|brother|hl-l|\bmfc-|\bdcp-|epson|\bcanon\b|lexmark|kyocera|\bxerox\b|ricoh|\bzebra\b|scanner",
            "printer",
        ),
        (
            r"(?i)camera|webcam|ipcam|\bcam-?\d|-cam\b|doorbell|reolink|amcrest|hikvision|\bdahua\b|\barlo\b|blink-?(cam|mini)|eufycam|nest-?cam|wyze-?cam|wyzecam|ring-doorbell",
            "camera",
        ),
        (
            r"(?i)\bsonos\b|homepod|\becho\b|\balexa\b|echo-?dot|nest-?mini|nest-?hub|nest-?audio|sound-?bar|\bheos\b|speaker|\bbose\b|\bdenon\b",
            "speaker",
        ),
        (
            r"(?i)esp-?\d|esp32|esp8266|tasmota|shelly|sonoff|tuya|smartlife|kasa|\bhs\d{3}|\bks\d{3}|\bkp\d{3}|wemo|meross|govee|lifx|nanoleaf|\bwiz-|yeelight|tradfri|\bhue\b|philips-?hue|lutron|caseta|ecobee|\bnest\b|thermostat|sensi|wyze|eufy|\bring\b|smartplug|-plug\b|plug-?\d|smartbulb|-bulb\b|light-?\d|smartswitch|vacuum|roborock|roomba|neato|deebot|ecovacs|airfryer|cosori|purifier|humidifier|smartthings|zigbee|z-?wave|\baqara\b|switchbot|\bmyq\b|\bwled\b",
            "iot",
        ),
        (
            r"(?i)router|gateway|\bap-?\d|access-?point|unifi|\budm\b|\buap\b|openwrt|dd-wrt|mikrotik|\beero\b|\borbi\b|nighthawk|fritz|\bomada\b|\bdeco\b|\bvelop\b|repeater|\bmodem\b|\bont\b",
            "router",
        ),
    ])
});

/// Ordered so specific products win over broad brands (a Kasa plug is IoT, not
/// a router, even though TP-Link mostly makes routers). Matched against the full
/// IEEE vendor name, so registry spellings like "Signify" appear here.
static VENDOR_KINDS: LazyLock<KindPatterns> = LazyLock::new(|| {
    KindPatterns::new(&[
        (
            r"(?i)synology|\bqnap\b|western digital|seagate|\bdrobo\b|terramaster|asustor",
            "nas",
        ),
        (
            r"(?i)hikvision|\bdahua\b|reolink|amcrest|\blorex\b|axis comm|\bwyze\b|\barlo\b|\bswann\b|uniview",
            "camera",
        ),
        (r"(?i)sonos|\bbose\b|\bdenon\b|marantz|\bheos\b|sonance", "speaker"),
        (r"(?i)nintendo", "console"),
        (
            r"(?i)espressif|\btuya\b|sonoff|itead|shelly|allterco|\bnest\b|\bring\b|\beufy\b|philips lighting|signify|ecobee|\blifx\b|nanoleaf|govee|yeelight|roborock|ecovacs|irobot|\bneato\b|tradfri|lutron|leviton|sengled|meross|switchbot|aqara|lumi|\bwiz\b|kasa|vesync|cosori|shenzhen.*(smart|iot|tech)",
            "iot",
        ),
        (r"(?i)brother|\bcanon\b|epson|lexmark|kyocera|\bxerox\b|ricoh|\bzebra\b|pantum", "printer"),
        (r"(?i)roku|vizio|lg elec|hisense|\btcl\b|skyworth|funai|\bonn\b|\bsony\b|amlogic|insignia", "tv"),
        (
            r"(?i)zyxel|tp-link|ubiquiti|netgear|mikrotik|\basus\b|d-link|\baruba\b|\bcisco\b|ruckus|meraki|juniper|fortinet|sonicwall|\barris\b|technicolor|sagemcom|actiontec|\bcalix\b|adtran|\beero\b|turris|\bzte\b|sagem",
            "router",
        ),
        (
            r"(?i)raspberry|\bintel\b|\bdell\b|lenovo|hp inc|hewlett|framework|gigabyte|\bmsi\b|micro-star|asrock|super ?micro|supermicro|elitegroup|pegatron|\bquanta\b|compal|wistron|\bclevo\b|tuxedo|beelink|minisforum|\bchuwi\b|system76",
            "computer",
        ),
        (
            r"(?i)\bapple\b|samsung|xiaomi|oneplus|huawei|\boppo\b|\bvivo\b|realme|motorola|\bhtc\b|nothing tech|fairphone",
            "phone",
        ),
    ])
});

/// mDNS TXT models like "MacBookPro18,3", "AudioAccessory5,1" or "iPad13,4"
/// are near-definitive product identifiers.
static MODEL_KINDS: LazyLock<KindPatterns> = LazyLock::new(|| {
    KindPatterns::new(&[
        (r"(?i)synology|diskstation|\bqnap\b", "nas"),
        (r"(?i)macbook|imac|macmini|mac-?mini|macpro|mac-?studio|macstudio|windows|surface|thinkpad|optiplex|latitude", "computer"),
        (r"(?i)ipad", "tablet"),
        (r"(?i)iphone|ipod|pixel|galaxy|sm-[a-z]|\bwatch\d", "phone"),
        (r"(?i)audioaccessory|homepod|sonos|\bspeaker\b", "speaker"),
        (r"(?i)\bcamera\b|\bcam\b|doorbell|hikvision|reolink", "camera"),
        (r"(?i)appletv|apple-?tv|shield|chromecast|bravia|roku|firetv|fire-?tv|android-?tv|vizio", "tv"),
        (r"(?i)\bhue\b|bridge|\bplug\b|bulb|sensor|thermostat", "iot"),
    ])
});

/// A listening service that all but names the device type: 9100/631 are print
/// protocols; 8009/8060 are Chromecast/Roku; 32400 is a Plex media server (an
/// always-on NAS-class box); 1400 is Sonos; 62078 (lockdownd) is iOS-only.
fn strong_port_kind(ports: &[u16]) -> Option<&'static str> {
    if ports.iter().any(|&p| matches!(p, 9100 | 631)) {
        return Some("printer");
    }
    if ports.iter().any(|&p| matches!(p, 8009 | 8060)) {
        return Some("tv");
    }
    if ports.contains(&62078) {
        return Some("phone");
    }
    if ports.contains(&1400) {
        return Some("speaker");
    }
    if ports.contains(&32400) {
        return Some("nas");
    }
    None
}

/// Ports that merely lean one way — used only as weak corroboration. RTSP is
/// usually an IP camera; SSH/SMB usually a computer or NAS.
fn weak_port_kind(ports: &[u16]) -> Option<&'static str> {
    if ports.contains(&554) {
        return Some("camera");
    }
    if ports.iter().any(|&p| matches!(p, 22 | 445)) {
        return Some("computer");
    }
    None
}

/// Trust weight of each signal. Strong signals outweigh any single weak one, so
/// unambiguous devices are decided outright; the arithmetic only changes the
/// outcome when several weaker signals point elsewhere together.
const W_MDNS_STRONG: i32 = 100;
const W_MDNS_MODEL: i32 = 60;
const W_STRONG_PORT: i32 = 55;
const W_HOSTNAME: i32 = 40;
const W_VENDOR: i32 = 25;
const W_MDNS_HINT: i32 = 15;
const W_WEAK_PORT: i32 = 12;

// Ordered most-specific first so a tie (equal weight *and* equal strongest
// single signal) resolves toward the narrower kind — nas over computer, camera
// or speaker over iot, console over tv.
const KIND_NAMES: [&str; 11] = [
    "router", "nas", "computer", "tablet", "phone", "console", "tv", "printer", "camera", "speaker",
    "iot",
];
const KIND_COUNT: usize = KIND_NAMES.len();

fn kind_index(kind: &str) -> Option<usize> {
    KIND_NAMES.iter().position(|&k| k == kind)
}

pub fn classify(
    vendor: Option<&str>,
    hostname: Option<&str>,
    mdns: Option<&MdnsHit>,
    open_ports: &[u16],
    is_gateway: bool,
    is_self: bool,
) -> String {
    if is_gateway {
        return "router".into();
    }
    if is_self {
        return "computer".into();
    }

    let votes: [(Option<&str>, i32); 7] = [
        (mdns.and_then(|hit| hit.kind), W_MDNS_STRONG),
        (
            mdns.and_then(|hit| hit.model.as_deref()).and_then(|m| MODEL_KINDS.matches(m)),
            W_MDNS_MODEL,
        ),
        (strong_port_kind(open_ports), W_STRONG_PORT),
        (hostname.and_then(|h| HOSTNAME_KINDS.matches(h)), W_HOSTNAME),
        (vendor.and_then(|v| VENDOR_KINDS.matches(v)), W_VENDOR),
        (mdns.and_then(|hit| hit.kind_hint), W_MDNS_HINT),
        (weak_port_kind(open_ports), W_WEAK_PORT),
    ];

    // Tally weight per kind, and remember each kind's single strongest signal to
    // break ties toward the more trustworthy source rather than sheer count.
    let mut total = [0i32; KIND_COUNT];
    let mut best_single = [0i32; KIND_COUNT];
    for (kind, weight) in votes {
        if let Some(i) = kind.and_then(kind_index) {
            total[i] += weight;
            best_single[i] = best_single[i].max(weight);
        }
    }

    let mut winner: Option<usize> = None;
    for i in 0..KIND_COUNT {
        if total[i] == 0 {
            continue;
        }
        let better = match winner {
            None => true,
            Some(w) => (total[i], best_single[i]) > (total[w], best_single[w]),
        };
        if better {
            winner = Some(i);
        }
    }

    winner.map(|i| KIND_NAMES[i]).unwrap_or("unknown").into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mdns::MdnsHit;

    fn strong(kind: &'static str) -> MdnsHit {
        MdnsHit { kind: Some(kind), ..Default::default() }
    }

    #[test]
    fn jetdirect_port_types_a_printer_without_any_other_signal() {
        assert_eq!(classify(None, None, None, &[80, 9100], false, false), "printer");
    }

    #[test]
    fn hostname_beats_a_merely_ambiguous_port() {
        // SSH alone would lean "computer", but a clear hostname outweighs it.
        assert_eq!(
            classify(None, Some("Living-Room-AppleTV"), None, &[22], false, false),
            "tv"
        );
    }

    #[test]
    fn ambiguous_ports_are_a_last_resort_over_unknown() {
        assert_eq!(classify(None, None, None, &[22], false, false), "computer");
        assert_eq!(classify(None, None, None, &[], false, false), "unknown");
    }

    #[test]
    fn role_flags_short_circuit_everything() {
        assert_eq!(classify(None, None, None, &[9100], true, false), "router");
        assert_eq!(classify(None, None, None, &[9100], false, true), "computer");
    }

    #[test]
    fn a_strong_mdns_service_outvotes_a_disagreeing_vendor() {
        assert_eq!(
            classify(Some("Google"), None, Some(&strong("tv")), &[], false, false),
            "tv"
        );
    }

    #[test]
    fn android_tv_hostname_is_a_tv_not_a_phone() {
        assert_eq!(classify(None, Some("android-tv-livingroom"), None, &[], false, false), "tv");
    }

    #[test]
    fn a_persons_name_does_not_trip_iot_substrings() {
        assert_eq!(
            classify(Some("Apple, Inc."), Some("Camerons-MacBook-Pro"), None, &[], false, false),
            "computer"
        );
    }

    #[test]
    fn nas_is_distinguished_from_a_plain_computer() {
        assert_eq!(
            classify(Some("Synology Incorporated"), Some("DiskStation"), None, &[445], false, false),
            "nas"
        );
        // A Plex media server port also reads as NAS-class.
        assert_eq!(classify(None, Some("media-server"), None, &[32400], false, false), "nas");
    }

    #[test]
    fn tablet_is_split_out_from_phone() {
        // iPad: hostname + model say tablet; vendor Apple + lockdownd say phone.
        // The tablet-specific model/hostname must outweigh the generic phone lean.
        let ipad = MdnsHit { model: Some("iPad13,4".into()), ..Default::default() };
        assert_eq!(
            classify(Some("Apple, Inc."), Some("Johns-iPad"), Some(&ipad), &[62078], false, false),
            "tablet"
        );
        // A plain iPhone still classifies as phone.
        assert_eq!(
            classify(Some("Apple, Inc."), Some("Johns-iPhone"), None, &[62078], false, false),
            "phone"
        );
    }

    #[test]
    fn game_consoles_get_their_own_kind() {
        assert_eq!(classify(None, Some("Xbox-Living-Room"), None, &[], false, false), "console");
        assert_eq!(classify(Some("Nintendo Co., Ltd."), Some("Switch"), None, &[], false, false), "console");
    }

    #[test]
    fn cameras_and_speakers_split_out_from_iot() {
        assert_eq!(
            classify(Some("Reolink"), Some("Front-Door-Cam"), None, &[554], false, false),
            "camera"
        );
        assert_eq!(
            classify(Some("Sonos, Inc."), Some("Kitchen-Sonos"), None, &[1400], false, false),
            "speaker"
        );
        // A generic smart plug is still plain IoT.
        assert_eq!(classify(Some("Espressif Inc."), Some("smartplug-1"), None, &[], false, false), "iot");
    }
}
