//! Best-effort device typing.
//!
//! Rather than trust the single highest-priority signal, every signal casts a
//! weighted vote and the highest-scoring kind wins. Strong signals (a
//! definitive mDNS service, a print port) carry enough weight to decide a
//! device on their own, so unambiguous cases are unchanged; the voting only
//! matters when weaker signals disagree, letting corroboration beat a lone
//! noisy guess. Role flags (gateway/self) still short-circuit outright.
use crate::devices::banner::BannerHit;
use crate::devices::dhcp::DhcpHit;
use crate::devices::ssdp::SsdpHit;
use crate::mdns::MdnsHit;
use regex_lite::Regex;
use std::sync::LazyLock;

/// Every identity signal gathered for one host. Bundled into a struct so new
/// sources (SSDP, HTTP banners, …) extend the classifier without reshuffling a
/// long positional argument list. All fields default to "absent".
#[derive(Default)]
pub struct Signals<'a> {
    /// Vendor from the MAC OUI table.
    pub vendor: Option<&'a str>,
    /// Best display name so far (mDNS/SSDP/NetBIOS/reverse-DNS).
    pub hostname: Option<&'a str>,
    pub mdns: Option<&'a MdnsHit>,
    pub ssdp: Option<&'a SsdpHit>,
    pub banner: Option<&'a BannerHit>,
    /// Passive DHCP fingerprint (Option 55/60) captured when the device joined.
    pub dhcp: Option<&'a DhcpHit>,
    /// Open TCP ports observed by the probe.
    pub open_ports: &'a [u16],
    pub is_gateway: bool,
    pub is_self: bool,
}

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
        // Watch/wearable — must precede the phone row so brand tokens shared with
        // phones ("galaxy watch", "pixel watch") land here, not on "phone".
        (
            r"(?i)\bwatch\b|-watch\b|watch-|apple-?watch|galaxy-?watch|pixel-?watch|smart-?watch|\bgizmo\b|fitbit|charge-?[2-6]\b|inspire-?[23]\b|\bversa\b|amazfit|ticwatch|wear-?os|mi-?band|\bfenix\b|forerunner|vivoactive|vivomove|\bvenu\b|instinct|\bgarmin\b",
            "watch",
        ),
        (
            r"(?i)iphone|ipod|pixel|galaxy|sm-[a-z]\d|nexus|xperia|oneplus|redmi|\bpoco\b|realme|\boppo\b|\bvivo\b|\bhonor\b|moto[- ]?[ge]|motorola|nokia-?\d|-phone\b|phone-|android-[0-9a-f]",
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
        // Wearable-first brands — before the phone row so a Garmin/Fitbit OUI
        // reads as a watch, not a generic handheld.
        (r"(?i)\bgarmin\b|\bfitbit\b|amazfit|\bhuami\b|mobvoi|\bwithings\b", "watch"),
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
        // Apple Watch reports models like "Watch6,1"; keep this above the phone
        // row so it isn't swept up as a generic Apple handheld.
        (r"(?i)\bwatch\d", "watch"),
        (r"(?i)iphone|ipod|pixel|galaxy|sm-[a-z]", "phone"),
        (r"(?i)audioaccessory|homepod|sonos|\bspeaker\b", "speaker"),
        (r"(?i)\bcamera\b|\bcam\b|doorbell|hikvision|reolink", "camera"),
        (r"(?i)appletv|apple-?tv|shield|chromecast|bravia|roku|firetv|fire-?tv|android-?tv|vizio", "tv"),
        (r"(?i)\bhue\b|bridge|\bplug\b|bulb|sensor|thermostat", "iot"),
    ])
});

/// UPnP `deviceType` URNs map fairly directly to a kind. MediaRenderer/DIAL are
/// almost always a TV or AV box; ZonePlayer is Sonos; the WAN/IGD types are the
/// router (usually already decided by the gateway flag); MediaServer leans NAS.
static SSDP_TYPE_KINDS: LazyLock<KindPatterns> = LazyLock::new(|| {
    KindPatterns::new(&[
        (r"(?i)InternetGatewayDevice|WANDevice|WANConnectionDevice|LANDevice", "router"),
        (r"(?i)Printer", "printer"),
        (r"(?i)ZonePlayer", "speaker"),
        (r"(?i)MediaRenderer|dial", "tv"),
        (r"(?i)MediaServer", "nas"),
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
/// A UPnP `deviceType` is reliable for printers/routers but ambiguous for the
/// media types (a MediaRenderer might be a TV or a soundbar), so it sits below
/// the strong-port vote and can't override a definitive mDNS service.
const W_SSDP_TYPE: i32 = 50;
/// A DHCP Option 55/60 fingerprint is a strong, hard-to-spoof OS-family signal
/// (phone vs computer) captured passively when a device joins, and it survives
/// MAC randomization. It sits just under a UPnP deviceType and above a hostname
/// or vendor guess.
const W_DHCP: i32 = 45;
const W_HOSTNAME: i32 = 40;
const W_VENDOR: i32 = 25;
/// An HTTP `Server` header or page `<title>` is corroboration, not proof — many
/// devices share an httpd string and titles are often generic ("Login"), so it
/// weighs a little under a hostname/vendor match.
const W_BANNER: i32 = 22;
const W_MDNS_HINT: i32 = 15;
const W_WEAK_PORT: i32 = 12;

// Ordered most-specific first so a tie (equal weight *and* equal strongest
// single signal) resolves toward the narrower kind — nas over computer, camera
// or speaker over iot, console over tv.
const KIND_NAMES: [&str; 12] = [
    "router", "nas", "computer", "tablet", "watch", "phone", "console", "tv", "printer", "camera",
    "speaker", "iot",
];
const KIND_COUNT: usize = KIND_NAMES.len();

fn kind_index(kind: &str) -> Option<usize> {
    KIND_NAMES.iter().position(|&k| k == kind)
}

pub fn classify(s: &Signals) -> String {
    if s.is_gateway {
        return "router".into();
    }
    if s.is_self {
        return "computer".into();
    }

    let Signals { vendor, hostname, mdns, ssdp, banner, dhcp, open_ports, .. } = *s;

    let votes: [(Option<&str>, i32); 16] = [
        (mdns.and_then(|hit| hit.kind), W_MDNS_STRONG),
        (
            mdns.and_then(|hit| hit.model.as_deref()).and_then(|m| MODEL_KINDS.matches(m)),
            W_MDNS_MODEL,
        ),
        (strong_port_kind(open_ports), W_STRONG_PORT),
        // SSDP casts the same shapes of vote as mDNS/hostname/vendor, from the
        // UPnP description: an explicit device type, plus model/name/vendor text
        // run through the existing regex tables.
        (
            ssdp.and_then(|hit| hit.device_type.as_deref()).and_then(|t| SSDP_TYPE_KINDS.matches(t)),
            W_SSDP_TYPE,
        ),
        (
            ssdp.and_then(|hit| hit.model.as_deref()).and_then(|m| MODEL_KINDS.matches(m)),
            W_MDNS_MODEL,
        ),
        (hostname.and_then(|h| HOSTNAME_KINDS.matches(h)), W_HOSTNAME),
        (
            ssdp.and_then(|hit| hit.name.as_deref()).and_then(|n| HOSTNAME_KINDS.matches(n)),
            W_HOSTNAME,
        ),
        (vendor.and_then(|v| VENDOR_KINDS.matches(v)), W_VENDOR),
        (
            ssdp.and_then(|hit| hit.manufacturer.as_deref()).and_then(|m| VENDOR_KINDS.matches(m)),
            W_VENDOR,
        ),
        // DHCP: the local fingerprint table's kind, plus the vendor class and
        // self-reported hostname run through the existing regex tables.
        (dhcp.and_then(|hit| hit.kind), W_DHCP),
        (
            dhcp.and_then(|hit| hit.vendor_class.as_deref()).and_then(|v| VENDOR_KINDS.matches(v)),
            W_VENDOR,
        ),
        (
            dhcp.and_then(|hit| hit.hostname.as_deref()).and_then(|h| HOSTNAME_KINDS.matches(h)),
            W_HOSTNAME,
        ),
        // HTTP banner: the page title reads like a device name, the Server
        // header like a vendor/product string — match both against the tables.
        (
            banner.and_then(|b| b.title.as_deref()).and_then(|t| HOSTNAME_KINDS.matches(t)),
            W_BANNER,
        ),
        (
            banner
                .and_then(|b| b.identity())
                .and_then(|t| VENDOR_KINDS.matches(&t).or_else(|| HOSTNAME_KINDS.matches(&t))),
            W_BANNER,
        ),
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
    use crate::devices::dhcp::DhcpHit;
    use crate::mdns::MdnsHit;

    fn strong(kind: &'static str) -> MdnsHit {
        MdnsHit { kind: Some(kind), ..Default::default() }
    }

    /// Classify from a partial set of signals — unspecified sources default to
    /// absent, keeping each test focused on the signals under test.
    fn kind(sig: Signals) -> String {
        classify(&sig)
    }

    #[test]
    fn jetdirect_port_types_a_printer_without_any_other_signal() {
        assert_eq!(kind(Signals { open_ports: &[80, 9100], ..Default::default() }), "printer");
    }

    #[test]
    fn hostname_beats_a_merely_ambiguous_port() {
        // SSH alone would lean "computer", but a clear hostname outweighs it.
        assert_eq!(
            kind(Signals {
                hostname: Some("Living-Room-AppleTV"),
                open_ports: &[22],
                ..Default::default()
            }),
            "tv"
        );
    }

    #[test]
    fn dhcp_fingerprint_types_a_phone_over_an_ambiguous_vendor() {
        // A randomized-MAC phone gives no useful OUI vendor, but its DHCP
        // fingerprint still says "phone".
        let dhcp = DhcpHit { kind: Some("phone"), ..Default::default() };
        assert_eq!(kind(Signals { dhcp: Some(&dhcp), ..Default::default() }), "phone");
    }

    #[test]
    fn dhcp_does_not_override_a_definitive_mdns_service() {
        // mDNS strong service (100) must still beat the DHCP vote (45).
        let mdns = strong("printer");
        let dhcp = DhcpHit { kind: Some("computer"), ..Default::default() };
        assert_eq!(
            kind(Signals { mdns: Some(&mdns), dhcp: Some(&dhcp), ..Default::default() }),
            "printer"
        );
    }

    #[test]
    fn ambiguous_ports_are_a_last_resort_over_unknown() {
        assert_eq!(kind(Signals { open_ports: &[22], ..Default::default() }), "computer");
        assert_eq!(kind(Signals::default()), "unknown");
    }

    #[test]
    fn role_flags_short_circuit_everything() {
        assert_eq!(
            kind(Signals { open_ports: &[9100], is_gateway: true, ..Default::default() }),
            "router"
        );
        assert_eq!(
            kind(Signals { open_ports: &[9100], is_self: true, ..Default::default() }),
            "computer"
        );
    }

    #[test]
    fn a_strong_mdns_service_outvotes_a_disagreeing_vendor() {
        assert_eq!(
            kind(Signals {
                vendor: Some("Google"),
                mdns: Some(&strong("tv")),
                ..Default::default()
            }),
            "tv"
        );
    }

    #[test]
    fn android_tv_hostname_is_a_tv_not_a_phone() {
        assert_eq!(
            kind(Signals { hostname: Some("android-tv-livingroom"), ..Default::default() }),
            "tv"
        );
    }

    #[test]
    fn generic_android_hostname_is_a_phone() {
        // A randomized-MAC Android with no vendor/mDNS still exposes a generic
        // "android-<hex>" hostname — that alone should type it as a phone.
        assert_eq!(
            kind(Signals { hostname: Some("android-1a2b3c4d"), ..Default::default() }),
            "phone"
        );
        // ...but the "android-<hex>" token must not swallow an Android TV.
        assert_eq!(
            kind(Signals { hostname: Some("android-tv-livingroom"), ..Default::default() }),
            "tv"
        );
    }

    #[test]
    fn a_bare_watch_hostname_is_a_watch() {
        // The real case: an Apple Watch resolves only to reverse-DNS "Watch"
        // (randomized MAC, no ports). That alone should type it as a watch.
        assert_eq!(kind(Signals { hostname: Some("Watch"), ..Default::default() }), "watch");
    }

    #[test]
    fn wearable_brands_type_as_watch_not_phone() {
        // "galaxy watch" shares the "galaxy" token with phones — the watch row
        // must win.
        assert_eq!(
            kind(Signals { hostname: Some("Galaxy-Watch5"), ..Default::default() }),
            "watch"
        );
        // Apple Watch mDNS model, even alongside an Apple vendor that leans phone.
        let mdns = MdnsHit { model: Some("Watch6,1".into()), ..Default::default() };
        assert_eq!(
            kind(Signals { vendor: Some("Apple, Inc."), mdns: Some(&mdns), ..Default::default() }),
            "watch"
        );
        // A Garmin OUI on a home LAN is a wearable, not a generic handheld.
        assert_eq!(kind(Signals { vendor: Some("Garmin International"), ..Default::default() }), "watch");
    }

    #[test]
    fn a_persons_name_does_not_trip_iot_substrings() {
        assert_eq!(
            kind(Signals {
                vendor: Some("Apple, Inc."),
                hostname: Some("Camerons-MacBook-Pro"),
                ..Default::default()
            }),
            "computer"
        );
    }

    #[test]
    fn nas_is_distinguished_from_a_plain_computer() {
        assert_eq!(
            kind(Signals {
                vendor: Some("Synology Incorporated"),
                hostname: Some("DiskStation"),
                open_ports: &[445],
                ..Default::default()
            }),
            "nas"
        );
        // A Plex media server port also reads as NAS-class.
        assert_eq!(
            kind(Signals {
                hostname: Some("media-server"),
                open_ports: &[32400],
                ..Default::default()
            }),
            "nas"
        );
    }

    #[test]
    fn tablet_is_split_out_from_phone() {
        // iPad: hostname + model say tablet; vendor Apple + lockdownd say phone.
        // The tablet-specific model/hostname must outweigh the generic phone lean.
        let ipad = MdnsHit { model: Some("iPad13,4".into()), ..Default::default() };
        assert_eq!(
            kind(Signals {
                vendor: Some("Apple, Inc."),
                hostname: Some("Johns-iPad"),
                mdns: Some(&ipad),
                open_ports: &[62078],
                ..Default::default()
            }),
            "tablet"
        );
        // A plain iPhone still classifies as phone.
        assert_eq!(
            kind(Signals {
                vendor: Some("Apple, Inc."),
                hostname: Some("Johns-iPhone"),
                open_ports: &[62078],
                ..Default::default()
            }),
            "phone"
        );
    }

    #[test]
    fn game_consoles_get_their_own_kind() {
        assert_eq!(
            kind(Signals { hostname: Some("Xbox-Living-Room"), ..Default::default() }),
            "console"
        );
        assert_eq!(
            kind(Signals {
                vendor: Some("Nintendo Co., Ltd."),
                hostname: Some("Switch"),
                ..Default::default()
            }),
            "console"
        );
    }

    #[test]
    fn cameras_and_speakers_split_out_from_iot() {
        assert_eq!(
            kind(Signals {
                vendor: Some("Reolink"),
                hostname: Some("Front-Door-Cam"),
                open_ports: &[554],
                ..Default::default()
            }),
            "camera"
        );
        assert_eq!(
            kind(Signals {
                vendor: Some("Sonos, Inc."),
                hostname: Some("Kitchen-Sonos"),
                open_ports: &[1400],
                ..Default::default()
            }),
            "speaker"
        );
        // A generic smart plug is still plain IoT.
        assert_eq!(
            kind(Signals {
                vendor: Some("Espressif Inc."),
                hostname: Some("smartplug-1"),
                ..Default::default()
            }),
            "iot"
        );
    }

    #[test]
    fn ssdp_device_type_types_a_silent_media_renderer() {
        // A TV that drops ping and announces nothing over mDNS, but answers SSDP.
        let ssdp = SsdpHit {
            device_type: Some("urn:schemas-upnp-org:device:MediaRenderer:1".into()),
            ..Default::default()
        };
        assert_eq!(kind(Signals { ssdp: Some(&ssdp), ..Default::default() }), "tv");
    }

    #[test]
    fn ssdp_model_and_name_corroborate_a_printer() {
        let ssdp = SsdpHit {
            name: Some("Office LaserJet".into()),
            model: Some("HP LaserJet Pro".into()),
            manufacturer: Some("Hewlett-Packard".into()),
            device_type: Some("urn:schemas-upnp-org:device:Printer:1".into()),
        };
        assert_eq!(
            kind(Signals { ssdp: Some(&ssdp), open_ports: &[80], ..Default::default() }),
            "printer"
        );
    }

    #[test]
    fn a_definitive_mdns_service_still_outvotes_an_ambiguous_ssdp_type() {
        // MediaRenderer leans TV, but a Sonos mDNS service is definitive speaker.
        let ssdp = SsdpHit {
            device_type: Some("urn:schemas-upnp-org:device:MediaRenderer:1".into()),
            ..Default::default()
        };
        assert_eq!(
            kind(Signals {
                mdns: Some(&strong("speaker")),
                ssdp: Some(&ssdp),
                ..Default::default()
            }),
            "speaker"
        );
    }

    #[test]
    fn http_banner_title_types_a_silent_router_web_ui() {
        // A device that only exposes an HTTP admin page — no mDNS/SSDP/hostname.
        let banner = BannerHit { server: Some("lighttpd".into()), title: Some("NETGEAR Router".into()) };
        assert_eq!(
            kind(Signals { banner: Some(&banner), open_ports: &[80], ..Default::default() }),
            "router"
        );
    }

    #[test]
    fn http_banner_corroborates_a_nas() {
        let banner = BannerHit { server: None, title: Some("Synology DiskStation".into()) };
        assert_eq!(
            kind(Signals { banner: Some(&banner), open_ports: &[80], ..Default::default() }),
            "nas"
        );
    }
}
