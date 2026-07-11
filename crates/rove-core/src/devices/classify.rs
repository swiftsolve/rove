//! Best-effort device typing.
//!
//! Rather than trust the single highest-priority signal, every signal casts a
//! weighted vote and the highest-scoring kind wins. Strong signals (a
//! definitive mDNS service, a print port) carry enough weight to decide a
//! device on their own, so unambiguous cases are unchanged; the voting only
//! matters when weaker signals disagree, letting corroboration beat a lone
//! noisy guess. Role flags (gateway/self) still short-circuit outright.
//!
//! Three refinements keep the arithmetic honest:
//! - free text relayed by several protocols (one discovered name echoed as the
//!   hostname, the SSDP friendlyName *and* the DHCP hostname) is deduplicated
//!   and votes once — a copied string is one observation, not corroboration;
//! - an ambiguous signal casts a *distribution* over kinds (lockdownd → mostly
//!   phone, some tablet/watch) instead of betting everything on its modal kind;
//! - physically implausible pairings cast negative votes (a host serving
//!   SSH/SMB/RDP is not a wearable), so a general-purpose machine can't be
//!   dragged into a handheld kind by a lone vendor guess.
//!
//! The [`Verdict`] also carries a [`Confidence`]: `Low` when the winner's lead
//! is thinner than one vendor-grade signal and no hostname-grade signal
//! anchors it, so the UI can hedge the label instead of stating it as fact.
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
    /// The MAC is locally administered (privacy-randomized). On a home network a
    /// device that randomizes yet leaks no other identity is almost always a
    /// smartphone — see the last-resort lean in [`classify`].
    pub is_randomized: bool,
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
            r"(?i)synology|diskstation|\bqnap\b|truenas|freenas|unraid|openmediavault|\bnas\b|nas-|-nas\b|asustor|terramaster|\bdrobo\b|mycloud|readynas",
            "nas",
        ),
        (
            r"(?i)macbook|imac|mac-?mini|mac-?pro|mac-?studio|\bpc\b|-pc\b|desktop|laptop|thinkpad|ideapad|thinkcentre|optiplex|latitude|inspiron|\bxps\b|alienware|elitebook|probook|\bomen\b|pavilion|zenbook|vivobook|surface|chromebook|chromebox|pixelbook|workstation|\bnuc\b|raspberry|\brpi\b|pi-?hole|steam-?deck|ubuntu|fedora|debian|archlinux|framework|system76|-server\b|server-|\bwin-[0-9a-z]|esxi|proxmox|vmware",
            "computer",
        ),
        (
            r"(?i)ipad|galaxy-?tab|\bsm-t\d|kindle|fire-?hd|fire-?tablet|-tablet\b|\btablet\b|lenovo-?tab|\btab-[a-z0-9]|mi-?pad|mediapad",
            "tablet",
        ),
        // Watch/wearable — must precede the phone row so brand tokens shared with
        // phones ("galaxy watch", "pixel watch") land here, not on "phone".
        (
            r"(?i)\bwatch\b|-watch\b|watch-|apple-?watch|galaxy-?watch|pixel-?watch|smart-?watch|\bsm-r\d|\bgizmo\b|fitbit|charge-?[2-6]\b|inspire-?[23]\b|\bversa\b|amazfit|ticwatch|wear-?os|mi-?band|\bfenix\b|forerunner|vivoactive|vivomove|\bvenu\b|instinct|\bgarmin\b",
            "watch",
        ),
        (
            r"(?i)iphone|ipod|pixel|galaxy|sm-[a-z]\d|nexus|xperia|oneplus|redmi|\bpoco\b|\biqoo\b|realme|\brmx\d{4}|\bcph\d{4}|\boppo\b|\bvivo\b|\bhonor\b|\bmate-?[1-9]\d?\b|moto[- ]?[ge]|motorola|nokia-?\d|infinix|\btecno\b|zenfone|-phone\b|phone-|android-[0-9a-f]",
            "phone",
        ),
        (
            r"(?i)\bxbox\b|playstation|\bps[345]\b|psvita|nintendo|-switch\b|switch-|\bwii\b|steam-?link|rog-?ally",
            "console",
        ),
        (
            r"(?i)appletv|apple-tv|android-?tv|google-?tv|chromecast|nvidia-?shield|\bshield\b|firetv|fire-?tv|fire-?stick|firestick|roku|bravia|aquos|webos|\blg-?tv|samsung-?tv|\btv\b|vizio|\btivo\b|mi-?box|set-?top|projector",
            "tv",
        ),
        (
            r"(?i)printer|officejet|laserjet|deskjet|\benvy\b|pixma|imageclass|maxify|workforce|ecotank|expression|brother|hl-l|\bmfc-|\bdcp-|epson|\bcanon\b|lexmark|kyocera|\bxerox\b|ricoh|\bzebra\b|scanner|octoprint|\bender-?\d|prusa|bambu-?lab",
            "printer",
        ),
        (
            r"(?i)camera|webcam|ipcam|\bcam-?\d|-cam\b|doorbell|reolink|amcrest|hikvision|\bdahua\b|\barlo\b|blink-?(cam|mini)|eufycam|nest-?cam|wyze-?cam|wyzecam|ring-doorbell|foscam|ezviz|\bannke\b|\bnvr\b|tapo-?c\d",
            "camera",
        ),
        (
            r"(?i)\bsonos\b|homepod|\becho\b|\balexa\b|echo-?dot|nest-?mini|nest-?hub|nest-?audio|sound-?bar|\bheos\b|speaker|\bbose\b|\bdenon\b|\bjbl\b|klipsch|bluesound|\bwiim\b|marantz|soundtouch|musiccast|symfonisk",
            "speaker",
        ),
        (
            r"(?i)esp-?\d|esp32|esp8266|tasmota|shelly|sonoff|tuya|smartlife|kasa|\btapo\b|tapo-|\bhs\d{3}|\bks\d{3}|\bkp\d{3}|\bp1\d{2}\b|wemo|meross|govee|lifx|nanoleaf|\bwiz-|yeelight|tradfri|\bhue\b|philips-?hue|lutron|caseta|ecobee|\bnest\b|thermostat|sensi|wyze|eufy|\bring\b|smartplug|-plug\b|plug-?\d|smartbulb|-bulb\b|light-?\d|smartswitch|vacuum|roborock|roomba|neato|deebot|ecovacs|airfryer|cosori|purifier|humidifier|dishwasher|\bwasher\b|\bdryer\b|fridge|refrigerator|\boven\b|microwave|smartthings|zigbee|z-?wave|\baqara\b|switchbot|\bmyq\b|\bwled\b|broadlink|netatmo|schlage|kwikset|\bnuki\b|door-?lock|doorlock|deadbolt|garage|sprinkler|irrigation|rachio|wallbox|chargepoint|juicebox|\bevse\b|solaredge|enphase|litter-?robot|petcube|blinds|curtain|weather-?station|awair|airthings|-sensor\b|sensor-|smoke-?alarm",
            "iot",
        ),
        (
            r"(?i)router|gateway|\bap-?\d|access-?point|unifi|\budm\b|\buap\b|openwrt|dd-wrt|mikrotik|\beero\b|\borbi\b|nighthawk|fritz|\bomada\b|\bdeco\b|\bvelop\b|repeater|\bmodem\b|\bont\b|linksys|airport|time-?capsule|extender|\barcher\b|tplink|starlink|gl-?inet|livebox|freebox|xfinity",
            "router",
        ),
    ])
});

/// Ordered so specific products win over broad brands. Matched against the full
/// IEEE vendor name, so registry spellings like "Signify" appear here.
///
/// TP-Link is deliberately absent from both the IoT and router rows: the IEEE
/// registry gives its entire catalog one name ("TP-LINK TECHNOLOGIES CO.,LTD."),
/// so a Kasa/Tapo smart plug is indistinguishable by vendor from an Archer
/// router. Rather than guess — and mislabel a bare AP/switch as "Smart home" or
/// a smart plug as "Network" — a lone TP-Link OUI casts no vendor vote and falls
/// back to "unknown". Real TP-Link gear of either kind still types correctly via
/// a stronger signal (the gateway short-circuit, or a `deco`/`omada`/`ap-N`/
/// `repeater`/`kasa`/`tapo` hostname, or an SSDP type, that decides the vote).
static VENDOR_KINDS: LazyLock<KindPatterns> = LazyLock::new(|| {
    KindPatterns::new(&[
        (
            r"(?i)synology|\bqnap\b|western digital|seagate|\bdrobo\b|terramaster|asustor",
            "nas",
        ),
        (
            r"(?i)hikvision|\bdahua\b|reolink|amcrest|\blorex\b|axis comm|\bwyze\b|\barlo\b|\bswann\b|uniview|ezviz|foscam|vivotek|hanwha|annke",
            "camera",
        ),
        (
            r"(?i)sonos|\bbose\b|\bdenon\b|marantz|\bheos\b|sonance|harman|\bjbl\b|bang & olufsen|klipsch|yamaha|\bonkyo\b|bluesound|devialet|\bpolk\b",
            "speaker",
        ),
        // PlayStation OUIs register as "Sony Interactive Entertainment" — must
        // precede the TV row, whose broad \bsony\b would otherwise claim them.
        (r"(?i)nintendo|sony interactive", "console"),
        // Phone brands whose registry names collide with a broader row below:
        // Transsion (Tecno/Infinix/itel) registers as "Shenzhen Transsion …",
        // which the IoT row's generic shenzhen catch-all would swallow.
        (r"(?i)transsion|hmd global", "phone"),
        (
            r"(?i)espressif|\btuya\b|sonoff|itead|shelly|allterco|\bnest\b|\bring\b|\beufy\b|philips lighting|signify|ecobee|\blifx\b|nanoleaf|govee|yeelight|roborock|ecovacs|irobot|\bneato\b|tradfri|\bikea\b|lutron|leviton|sengled|meross|switchbot|aqara|lumi|\bwiz\b|vesync|cosori|broadlink|netatmo|\bsomfy\b|resideo|honeywell|chamberlain|liftmaster|rachio|rain bird|ledvance|osram|\bmidea\b|\bdyson\b|\bgree\b|daikin|smartthings|samjin|emporia|enphase|solaredge|fronius|growatt|wallbox|chargepoint|ecoflow|\bnuki\b|august home|allegion|schlage|kwikset|shenzhen.*(smart|iot|tech)",
            "iot",
        ),
        (
            r"(?i)brother|\bcanon\b|epson|lexmark|kyocera|\bxerox\b|ricoh|\bzebra\b|pantum|oki electric",
            "printer",
        ),
        (
            r"(?i)roku|vizio|lg elec|hisense|\btcl\b|skyworth|funai|\bonn\b|\bsony\b|amlogic|insignia|panasonic|xgimi",
            "tv",
        ),
        // "Compal Broadband" (cable modems) must precede the computer row, whose
        // bare "compal" token covers the laptop-ODM sibling company. Bare "Nokia"
        // OUIs are ISP gateways/ONTs — Nokia-brand phones register as HMD Global.
        (
            r"(?i)zyxel|ubiquiti|netgear|mikrotik|\basus\b|d-link|\baruba\b|\bcisco\b|ruckus|meraki|juniper|fortinet|sonicwall|\barris\b|technicolor|sagemcom|actiontec|\bcalix\b|adtran|\beero\b|turris|\bzte\b|sagem|\btenda\b|hitron|commscope|cambium|engenius|sercomm|\baskey\b|\bhumax\b|vantiva|airties|plume design|compal broadband|\bnokia\b",
            "router",
        ),
        (
            r"(?i)raspberry|\bintel\b|\bdell\b|lenovo|hp inc|hewlett|framework|gigabyte|\bmsi\b|micro-star|asrock|super ?micro|supermicro|elitegroup|pegatron|\bquanta\b|compal|wistron|\bclevo\b|tuxedo|beelink|minisforum|\bchuwi\b|system76|\bacer\b|fujitsu|lite-?on|azurewave|vmware|parallels|pcs systemtechnik|\bzotac\b",
            "computer",
        ),
        // Wearable-first brands — before the phone row so a Garmin/Fitbit OUI
        // reads as a watch, not a generic handheld.
        (r"(?i)\bgarmin\b|\bfitbit\b|amazfit|\bhuami\b|mobvoi|\bwithings\b|polar electro", "watch"),
        (
            r"(?i)\bapple\b|samsung|xiaomi|oneplus|huawei|\bhonor\b|\boppo\b|\bvivo\b|realme|motorola|\bhtc\b|nothing tech|fairphone",
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
        (r"(?i)ipad|galaxy-?tab|\bsm-t\d|kindle", "tablet"),
        // Apple Watch reports models like "Watch6,1"; keep this above the phone
        // row so it isn't swept up as a generic Apple handheld. Samsung watches
        // are SM-R models — above the phone row's broader sm-[a-z].
        (r"(?i)\bwatch\d|\bsm-r\d", "watch"),
        (r"(?i)iphone|ipod|pixel|galaxy|sm-[a-z]", "phone"),
        (r"(?i)playstation|\bps[45]\b|\bxbox\b|nintendo", "console"),
        (r"(?i)audioaccessory|homepod|sonos|\bspeaker\b|soundbar", "speaker"),
        (r"(?i)\bcamera\b|\bcam\b|doorbell|hikvision|reolink", "camera"),
        (r"(?i)appletv|apple-?tv|shield|chromecast|bravia|roku|firetv|fire-?tv|android-?tv|vizio", "tv"),
        (r"(?i)\bhue\b|bridge|\bplug\b|bulb|sensor|thermostat|roomba|robovac|vacuum", "iot"),
    ])
});

/// UPnP `deviceType` URNs map fairly directly to a kind. MediaRenderer/DIAL are
/// almost always a TV or AV box; ZonePlayer is Sonos; the WAN/IGD types are the
/// router (usually already decided by the gateway flag); MediaServer leans NAS.
static SSDP_TYPE_KINDS: LazyLock<KindPatterns> = LazyLock::new(|| {
    KindPatterns::new(&[
        (
            r"(?i)InternetGatewayDevice|WANDevice|WANConnectionDevice|LANDevice|WLANAccessPointDevice",
            "router",
        ),
        (r"(?i)Printer", "printer"),
        (r"(?i)ZonePlayer", "speaker"),
        // Belkin Wemo plugs/switches announce vendor URNs like
        // "urn:Belkin:device:controllee:1".
        (r"(?i)urn:belkin:device", "iot"),
        (r"(?i)MediaRenderer|dial", "tv"),
        (r"(?i)MediaServer", "nas"),
    ])
});

/// A listening service that all but names the device type: 9100/631 are print
/// protocols; 8060 is the Roku control port (a streaming box is always a TV);
/// 32400 is a Plex media server (an always-on NAS-class box); 1400 is Sonos.
/// 9999 and 6668 are the local-control APIs of the two largest smart-plug/bulb
/// families (Kasa-style and Tuya-based respectively) — the population that is
/// otherwise silent: no mDNS, no SSDP, and a module-vendor or catalog-wide OUI
/// the registry can't split.
///
/// Chromecast's 8009 is deliberately *not* here: it's the whole Google Cast
/// family — Chromecasts, Nest Hubs *and* audio-only Cast speakers/smart clocks —
/// so on its own it can't tell a TV from a speaker. It's a weak TV lean instead
/// (see [`weak_port_kind`]), leaving the precise call to the mDNS `ca`
/// capabilities that split audio-out from video-out devices.
fn strong_port_kind(ports: &[u16]) -> Option<&'static str> {
    if ports.iter().any(|&p| matches!(p, 9100 | 631)) {
        return Some("printer");
    }
    if ports.contains(&8060) {
        return Some("tv");
    }
    if ports.contains(&1400) {
        return Some("speaker");
    }
    if ports.contains(&32400) {
        return Some("nas");
    }
    if ports.iter().any(|&p| matches!(p, 9999 | 6668)) {
        return Some("iot");
    }
    None
}

/// Apple's lockdownd (62078) runs on every Apple handheld — iPhone, iPad *and*
/// Apple Watch — so it marks the device as an Apple mobile but can't say which.
/// It votes the whole distribution, weighted toward the modal "phone" at a
/// weight a more specific tablet/watch hostname or model still outranks, while
/// the minor shares corroborate whichever handheld the device names itself as
/// — an Apple Watch that only reverse-resolves to "Watch" isn't flipped to a
/// phone the moment a scan catches lockdownd open.
fn apple_mobile_port_votes(ports: &[u16]) -> &'static [(&'static str, i32)] {
    if ports.contains(&62078) {
        &[("phone", W_LOCKDOWND), ("tablet", 12), ("watch", 8)]
    } else {
        &[]
    }
}

/// Ports that merely lean one way — used only as weak corroboration. RTSP is
/// usually an IP camera; SSH/SMB usually a computer or NAS. Chromecast's 8009
/// is the whole Cast family — mostly TVs and streamers, but also audio-only
/// Cast speakers — so it votes a TV-leaning distribution that breaks a device
/// out of "unknown" without outweighing a definitive mDNS speaker verdict.
fn weak_port_votes(ports: &[u16]) -> &'static [(&'static str, i32)] {
    if ports.contains(&554) {
        return &[("camera", W_WEAK_PORT)];
    }
    if ports.iter().any(|&p| matches!(p, 22 | 445)) {
        return &[("computer", W_WEAK_PORT)];
    }
    if ports.contains(&8009) {
        return &[("tv", W_WEAK_PORT), ("speaker", 6)];
    }
    &[]
}

/// Negative evidence. An open SSH, SMB or RDP service means a general-purpose
/// OS — no watch, phone or tablet serves these on a LAN — so those kinds are
/// penalized enough to cancel a lone vendor guess (an Apple OUI plus SSH/SMB
/// now reads "computer", not "phone") without overturning a real handheld
/// signal like a hostname or hardware model.
fn implausible_port_votes(ports: &[u16]) -> &'static [(&'static str, i32)] {
    if ports.iter().any(|&p| matches!(p, 22 | 445 | 3389)) {
        &[("watch", -30), ("phone", -20), ("tablet", -15)]
    } else {
        &[]
    }
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
/// Apple lockdownd (62078) leans "phone" but must sit below a hostname/model so
/// a device that names itself an iPad or Watch keeps that kind — lockdownd can't
/// tell the three Apple handhelds apart (see [`apple_mobile_port_kind`]).
const W_LOCKDOWND: i32 = 30;
const W_VENDOR: i32 = 25;
/// An HTTP `Server` header or page `<title>` is corroboration, not proof — many
/// devices share an httpd string and titles are often generic ("Login"), so it
/// weighs a little under a hostname/vendor match.
const W_BANNER: i32 = 22;
const W_MDNS_HINT: i32 = 15;
const W_WEAK_PORT: i32 = 12;
/// A privacy-randomized MAC with no other identity leans "phone" — the lightest
/// vote of all, below even a weak port, so it only decides a device that would
/// otherwise be "unknown" and never overrides a real signal. Deliberately thin
/// enough to leave the verdict Low-confidence (hedged "Phone?").
const W_RANDOMIZED_PHONE: i32 = 10;

/// A verdict is decisive only when the winner leads the runner-up by at least
/// one vendor-grade signal, or is anchored by a single signal of hostname
/// grade or better. Anything thinner — a lone weak port, a contested vote —
/// is a best guess the UI hedges.
const CONFIDENCE_MARGIN: i32 = W_VENDOR;
const CONFIDENCE_ANCHOR: i32 = W_HOSTNAME;

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

/// How decisive the vote was. `Low` marks a thin-margin best guess — the UI
/// renders those hedged ("Phone?") rather than as fact.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Confidence {
    High,
    Low,
}

impl Confidence {
    pub fn as_str(self) -> &'static str {
        match self {
            Confidence::High => "high",
            Confidence::Low => "low",
        }
    }
}

/// The classifier's answer: the winning kind plus how decisive the vote was.
pub struct Verdict {
    pub kind: &'static str,
    pub confidence: Confidence,
}

/// Accumulated votes per kind. `best_single` remembers each kind's strongest
/// positive signal, both to break ties toward the more trustworthy source
/// (rather than sheer count) and to anchor the confidence call.
#[derive(Default)]
struct Tally {
    total: [i32; KIND_COUNT],
    best_single: [i32; KIND_COUNT],
}

impl Tally {
    fn cast(&mut self, kind: Option<&str>, weight: i32) {
        if let Some(i) = kind.and_then(kind_index) {
            self.total[i] += weight;
            if weight > 0 {
                self.best_single[i] = self.best_single[i].max(weight);
            }
        }
    }

    fn cast_all(&mut self, votes: &[(&str, i32)]) {
        for &(kind, weight) in votes {
            self.cast(Some(kind), weight);
        }
    }

    fn verdict(&self) -> Verdict {
        let mut winner: Option<usize> = None;
        for i in 0..KIND_COUNT {
            // A kind pushed to zero or below by negative evidence is out of
            // the running entirely.
            if self.total[i] <= 0 {
                continue;
            }
            let better = match winner {
                None => true,
                Some(w) => {
                    (self.total[i], self.best_single[i]) > (self.total[w], self.best_single[w])
                }
            };
            if better {
                winner = Some(i);
            }
        }
        let Some(w) = winner else {
            return Verdict { kind: "unknown", confidence: Confidence::Low };
        };
        let runner_up =
            (0..KIND_COUNT).filter(|&i| i != w).map(|i| self.total[i].max(0)).max().unwrap_or(0);
        let decisive = self.total[w] - runner_up >= CONFIDENCE_MARGIN
            || self.best_single[w] >= CONFIDENCE_ANCHOR;
        Verdict {
            kind: KIND_NAMES[w],
            confidence: if decisive { Confidence::High } else { Confidence::Low },
        }
    }
}

/// One free-text vote channel (names, vendor strings, models), remembering
/// each string already cast against its table: `build_device` copies a single
/// discovered name into several protocol slots (the display hostname may *be*
/// the SSDP friendlyName or the DHCP-reported hostname), and the same text
/// relayed twice is one observation, not corroboration. Callers cast the
/// highest-weight slot first so a duplicate keeps its strongest reading.
struct TextChannel<'a> {
    table: &'static LazyLock<KindPatterns>,
    seen: Vec<&'a str>,
}

impl<'a> TextChannel<'a> {
    fn new(table: &'static LazyLock<KindPatterns>) -> Self {
        Self { table, seen: Vec::new() }
    }

    fn vote(&mut self, tally: &mut Tally, text: Option<&'a str>, weight: i32) {
        let Some(text) = text else { return };
        if self.seen.iter().any(|prior| prior.eq_ignore_ascii_case(text)) {
            return;
        }
        self.seen.push(text);
        tally.cast(self.table.matches(text), weight);
    }
}

pub fn classify(s: &Signals) -> Verdict {
    if s.is_gateway {
        return Verdict { kind: "router", confidence: Confidence::High };
    }
    if s.is_self {
        return Verdict { kind: "computer", confidence: Confidence::High };
    }

    let Signals { vendor, hostname, mdns, ssdp, banner, dhcp, open_ports, .. } = *s;

    let mut tally = Tally::default();

    // Definitive service, port, device-type and fingerprint signals.
    tally.cast(mdns.and_then(|hit| hit.kind), W_MDNS_STRONG);
    tally.cast(strong_port_kind(open_ports), W_STRONG_PORT);
    // SSDP's explicit UPnP device type; its model/name/manufacturer text joins
    // the shared free-text channels below.
    tally.cast(
        ssdp.and_then(|hit| hit.device_type.as_deref()).and_then(|t| SSDP_TYPE_KINDS.matches(t)),
        W_SSDP_TYPE,
    );
    // DHCP: the local fingerprint table's kind; its vendor class and
    // self-reported hostname join the free-text channels below.
    tally.cast(dhcp.and_then(|hit| hit.kind), W_DHCP);
    tally.cast(mdns.and_then(|hit| hit.kind_hint), W_MDNS_HINT);

    // Free-text channels, deduplicated per table (see TextChannel).
    let mut models = TextChannel::new(&MODEL_KINDS);
    models.vote(&mut tally, mdns.and_then(|hit| hit.model.as_deref()), W_MDNS_MODEL);
    models.vote(&mut tally, ssdp.and_then(|hit| hit.model.as_deref()), W_MDNS_MODEL);

    let mut names = TextChannel::new(&HOSTNAME_KINDS);
    names.vote(&mut tally, hostname, W_HOSTNAME);
    names.vote(&mut tally, ssdp.and_then(|hit| hit.name.as_deref()), W_HOSTNAME);
    names.vote(&mut tally, dhcp.and_then(|hit| hit.hostname.as_deref()), W_HOSTNAME);
    // The HTTP page title reads like a device name.
    names.vote(&mut tally, banner.and_then(|b| b.title.as_deref()), W_BANNER);

    let mut vendors = TextChannel::new(&VENDOR_KINDS);
    vendors.vote(&mut tally, vendor, W_VENDOR);
    vendors.vote(&mut tally, ssdp.and_then(|hit| hit.manufacturer.as_deref()), W_VENDOR);
    vendors.vote(&mut tally, dhcp.and_then(|hit| hit.vendor_class.as_deref()), W_VENDOR);

    // The banner identity (Server header + title joined) reads like a
    // vendor/product string — an owned join, so matched directly.
    if let Some(identity) = banner.and_then(|b| b.identity()) {
        tally.cast(
            VENDOR_KINDS.matches(&identity).or_else(|| HOSTNAME_KINDS.matches(&identity)),
            W_BANNER,
        );
    }

    // Ambiguous ports vote distributions; implausible pairings vote against.
    tally.cast_all(apple_mobile_port_votes(open_ports));
    tally.cast_all(weak_port_votes(open_ports));
    tally.cast_all(implausible_port_votes(open_ports));

    // Last resort: a privacy-randomized MAC that leaked nothing else. Both iOS
    // and Android randomize by default, so the silent randomizer on a home LAN
    // is far more often a phone than anything else — computers and IoT that
    // randomize almost always also expose a hostname or service that has already
    // voted above. The vote is the lightest of all, so it only breaks a device
    // out of "unknown"; the implausible-handheld penalties above still cancel it
    // for a randomizing laptop that serves SSH/SMB/RDP (net-negative → excluded).
    if s.is_randomized {
        tally.cast(Some("phone"), W_RANDOMIZED_PHONE);
    }

    tally.verdict()
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
        classify(&sig).kind.to_string()
    }

    fn confidence(sig: Signals) -> Confidence {
        classify(&sig).confidence
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
    fn lockdownd_does_not_flip_a_named_watch_to_a_phone() {
        // The reported bug: an Apple Watch (randomized MAC → reverse-DNS "Watch"
        // only) exposes lockdownd (62078), shared with iPhone/iPad. That port must
        // not override the "Watch" hostname, or the device flaps to "phone" the
        // moment a scan catches the port open.
        assert_eq!(
            kind(Signals { hostname: Some("Watch"), open_ports: &[62078], ..Default::default() }),
            "watch"
        );
        // Same for an iPad that only names itself via reverse-DNS (no mDNS model):
        // its hostname must still win over the shared lockdownd port.
        assert_eq!(
            kind(Signals { hostname: Some("Johns-iPad"), open_ports: &[62078], ..Default::default() }),
            "tablet"
        );
        // ...but lockdownd alone (nothing more specific) still lands on "phone".
        assert_eq!(kind(Signals { open_ports: &[62078], ..Default::default() }), "phone");
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
    fn a_bare_tp_link_oui_stays_unknown() {
        // TP-Link's OUI resolves to one generic name shared by Kasa/Tapo plugs
        // and Archer/Deco networking gear. With no other signal it must cast no
        // vendor vote and fall back to "unknown", rather than guess "Smart home"
        // (mislabeling a bare AP/switch) or "Network" (mislabeling a smart plug).
        assert_eq!(kind(Signals { vendor: Some("TP-Link"), ..Default::default() }), "unknown");
    }

    #[test]
    fn a_tp_link_router_still_types_as_router_via_stronger_signals() {
        // The gateway is a router regardless of vendor (role flag short-circuits).
        assert_eq!(
            kind(Signals { vendor: Some("TP-Link"), is_gateway: true, ..Default::default() }),
            "router"
        );
        // A non-gateway TP-Link mesh node/AP names itself: the router hostname
        // (weight 40) outvotes the IoT vendor lean (weight 25).
        assert_eq!(
            kind(Signals {
                vendor: Some("TP-Link"),
                hostname: Some("Deco-X20"),
                ..Default::default()
            }),
            "router"
        );
    }

    #[test]
    fn a_cast_speaker_is_not_overridden_by_its_cast_family_signals() {
        // A Lenovo Smart Clock (Google Assistant speaker): mDNS `ca` types it a
        // speaker, but it also exposes the whole Cast family — port 8009 and an
        // SSDP DIAL device type — which used to sum to a heavier "tv" vote and
        // flip it. The definitive mDNS speaker verdict must now win.
        let ssdp = SsdpHit {
            device_type: Some("urn:dial-multiscreen-org:device:dial:1".into()),
            name: Some("Living room clock".into()),
            ..Default::default()
        };
        assert_eq!(
            kind(Signals {
                vendor: Some("Motorola (Wuhan) Mobility Technologies"),
                hostname: Some("Living room clock"),
                mdns: Some(&strong("speaker")),
                ssdp: Some(&ssdp),
                open_ports: &[8009],
                ..Default::default()
            }),
            "speaker"
        );
        // ...but a bare Cast device with no mDNS verdict still falls back to TV
        // (the common case is a Chromecast), rather than dropping to "unknown".
        assert_eq!(kind(Signals { open_ports: &[8009], ..Default::default() }), "tv");
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
    fn registry_name_collisions_resolve_to_the_specific_brand() {
        // PlayStations register as "Sony Interactive Entertainment" — console,
        // not swept up by the TV row's broad \bsony\b (Bravia OUIs).
        assert_eq!(
            kind(Signals { vendor: Some("Sony Interactive Entertainment Inc."), ..Default::default() }),
            "console"
        );
        assert_eq!(kind(Signals { vendor: Some("Sony Corporation"), ..Default::default() }), "tv");
        // Transsion phones register as "Shenzhen Transsion …" — the IoT row's
        // generic shenzhen catch-all must not swallow them.
        assert_eq!(
            kind(Signals {
                vendor: Some("Shenzhen Transsion Technologies Co.Ltd"),
                ..Default::default()
            }),
            "phone"
        );
        // Bare "Nokia" OUIs are ISP gateways; Nokia-brand phones are HMD Global.
        assert_eq!(kind(Signals { vendor: Some("Nokia"), ..Default::default() }), "router");
        assert_eq!(kind(Signals { vendor: Some("HMD Global Oy"), ..Default::default() }), "phone");
        // Compal Broadband makes cable modems; Compal Electronics builds laptops.
        assert_eq!(
            kind(Signals { vendor: Some("Compal Broadband Networks, Inc."), ..Default::default() }),
            "router"
        );
        assert_eq!(
            kind(Signals { vendor: Some("COMPAL ELECTRONICS, INC."), ..Default::default() }),
            "computer"
        );
    }

    #[test]
    fn broader_vendor_coverage_types_common_home_brands() {
        assert_eq!(kind(Signals { vendor: Some("IKEA of Sweden AB"), ..Default::default() }), "iot");
        assert_eq!(kind(Signals { vendor: Some("Netatmo"), ..Default::default() }), "iot");
        assert_eq!(kind(Signals { vendor: Some("Harman/Becker Automotive Systems GmbH"), ..Default::default() }), "speaker");
        assert_eq!(kind(Signals { vendor: Some("Yamaha Corporation"), ..Default::default() }), "speaker");
        assert_eq!(kind(Signals { vendor: Some("EZVIZ CO.,LTD."), ..Default::default() }), "camera");
        assert_eq!(kind(Signals { vendor: Some("Panasonic Corporation"), ..Default::default() }), "tv");
        assert_eq!(kind(Signals { vendor: Some("Tenda Technology Co.,Ltd"), ..Default::default() }), "router");
        assert_eq!(kind(Signals { vendor: Some("Polar Electro Oy"), ..Default::default() }), "watch");
        assert_eq!(kind(Signals { vendor: Some("VMware, Inc."), ..Default::default() }), "computer");
        // Honor split from Huawei and now registers its own OUIs — a phone maker.
        assert_eq!(kind(Signals { vendor: Some("Honor Device Co., Ltd."), ..Default::default() }), "phone");
    }

    #[test]
    fn broader_hostname_coverage_types_common_devices() {
        // Windows default machine names ("WIN-ABC123DEF45").
        assert_eq!(kind(Signals { hostname: Some("WIN-ABC123DEF45"), ..Default::default() }), "computer");
        // Smart appliances.
        assert_eq!(kind(Signals { hostname: Some("LG-Dishwasher"), ..Default::default() }), "iot");
        assert_eq!(kind(Signals { hostname: Some("kitchen-fridge"), ..Default::default() }), "iot");
        // Realme/OPPO model-code hostnames.
        assert_eq!(kind(Signals { hostname: Some("RMX3563"), ..Default::default() }), "phone");
        assert_eq!(kind(Signals { hostname: Some("CPH2451"), ..Default::default() }), "phone");
        // iQOO (phone-only brand) and Huawei Mate default hostnames.
        assert_eq!(kind(Signals { hostname: Some("iQOO-Neo9"), ..Default::default() }), "phone");
        assert_eq!(kind(Signals { hostname: Some("HUAWEI-Mate40-Pro"), ..Default::default() }), "phone");
        // ...but the Mate token must stay phone-specific: a word that merely
        // ends in "mate" (no boundary, no trailing model number) is not a phone.
        assert_eq!(kind(Signals { hostname: Some("teammate"), ..Default::default() }), "unknown");
        // ISP CPE and mesh gear.
        assert_eq!(kind(Signals { hostname: Some("Livebox-A1B2"), ..Default::default() }), "router");
        assert_eq!(kind(Signals { hostname: Some("Archer-AX55"), ..Default::default() }), "router");
    }

    #[test]
    fn tapo_hostnames_split_cameras_from_plugs() {
        // A Tapo camera model token must win over the generic Tapo IoT token.
        assert_eq!(kind(Signals { hostname: Some("Tapo-C210"), ..Default::default() }), "camera");
        // Any other Tapo device (plugs, bulbs) is smart home.
        assert_eq!(kind(Signals { hostname: Some("Tapo-P110"), ..Default::default() }), "iot");
    }

    #[test]
    fn a_smart_plug_control_port_types_iot_without_any_other_signal() {
        // The silent-plug case: no mDNS/SSDP, no hostname, and an OUI that is
        // either a module vendor or too catalog-wide to vote. The local-control
        // API port alone must decide it.
        assert_eq!(kind(Signals { open_ports: &[9999], ..Default::default() }), "iot");
        assert_eq!(kind(Signals { open_ports: &[80, 6668], ..Default::default() }), "iot");
    }

    #[test]
    fn wemo_ssdp_device_type_is_iot() {
        let ssdp = SsdpHit {
            device_type: Some("urn:Belkin:device:controllee:1".into()),
            ..Default::default()
        };
        assert_eq!(kind(Signals { ssdp: Some(&ssdp), ..Default::default() }), "iot");
    }

    #[test]
    fn samsung_watch_model_is_a_watch_not_a_phone() {
        // Galaxy Watch models are "SM-R…" — must land on the watch row, not the
        // phone row's broader "sm-[a-z]".
        let mdns = MdnsHit { model: Some("SM-R930".into()), ..Default::default() };
        assert_eq!(
            kind(Signals { vendor: Some("Samsung Electronics"), mdns: Some(&mdns), ..Default::default() }),
            "watch"
        );
    }

    #[test]
    fn the_same_name_relayed_by_several_protocols_votes_once() {
        // build_device copies one discovered name across protocol slots (the
        // display hostname may *be* the SSDP friendlyName or the DHCP-reported
        // hostname). Echoed three times it must still count as one observation,
        // so the stronger independent signal — the mDNS hardware model — wins.
        let mdns = MdnsHit { model: Some("iPad13,4".into()), ..Default::default() };
        let ssdp = SsdpHit { name: Some("Johns-iPhone".into()), ..Default::default() };
        let dhcp = DhcpHit { hostname: Some("Johns-iPhone".into()), ..Default::default() };
        assert_eq!(
            kind(Signals {
                hostname: Some("Johns-iPhone"),
                mdns: Some(&mdns),
                ssdp: Some(&ssdp),
                dhcp: Some(&dhcp),
                ..Default::default()
            }),
            "tablet"
        );
    }

    #[test]
    fn distinct_names_still_corroborate() {
        // Different strings are independent observations: two phone-ish names
        // together must outvote the lone model signal that wins above.
        let mdns = MdnsHit { model: Some("iPad13,4".into()), ..Default::default() };
        let dhcp = DhcpHit { hostname: Some("Johns-iPhone".into()), ..Default::default() };
        assert_eq!(
            kind(Signals {
                hostname: Some("iPhone-15-Pro"),
                mdns: Some(&mdns),
                dhcp: Some(&dhcp),
                ..Default::default()
            }),
            "phone"
        );
    }

    #[test]
    fn computer_ports_rule_out_a_handheld_vendor_guess() {
        // A Mac with SSH + SMB sharing on and no useful hostname: the Apple
        // OUI's phone lean (25) used to beat the weak computer ports (12); the
        // negative handheld evidence now flips it to what the ports prove.
        assert_eq!(
            kind(Signals {
                vendor: Some("Apple, Inc."),
                open_ports: &[22, 445],
                ..Default::default()
            }),
            "computer"
        );
        // ...but a real handheld signal survives the penalty: a device that
        // names itself an iPhone stays a phone even with such a port open.
        assert_eq!(
            kind(Signals {
                vendor: Some("Apple, Inc."),
                hostname: Some("Johns-iPhone"),
                open_ports: &[22],
                ..Default::default()
            }),
            "phone"
        );
    }

    #[test]
    fn samsung_galaxy_phones_type_across_every_signal() {
        // OUI vendor (non-randomized handset, or a hotspot).
        assert_eq!(
            kind(Signals { vendor: Some("Samsung Electronics Co.,Ltd"), ..Default::default() }),
            "phone"
        );
        // The randomization-surviving DHCP fingerprint.
        let dhcp = DhcpHit { kind: Some("phone"), os: Some("Android"), ..Default::default() };
        assert_eq!(kind(Signals { dhcp: Some(&dhcp), ..Default::default() }), "phone");
        // Default hostnames: the marketing name and the raw model code.
        assert_eq!(kind(Signals { hostname: Some("Galaxy-S23-Ultra"), ..Default::default() }), "phone");
        assert_eq!(kind(Signals { hostname: Some("SM-S918B"), ..Default::default() }), "phone");
        assert_eq!(kind(Signals { hostname: Some("SM-A546B"), ..Default::default() }), "phone");
        // Foldables (Z Fold/Flip are SM-F) are still phones.
        assert_eq!(kind(Signals { hostname: Some("SM-F946B"), ..Default::default() }), "phone");
        // ...but the Samsung sibling model prefixes must NOT read as phones: a
        // Galaxy Watch (SM-R) is a watch and a Galaxy Tab (SM-T) is a tablet.
        assert_eq!(kind(Signals { hostname: Some("SM-R930"), ..Default::default() }), "watch");
        assert_eq!(kind(Signals { hostname: Some("SM-T870"), ..Default::default() }), "tablet");
    }

    #[test]
    fn a_silent_randomized_mac_leans_phone() {
        // The modern-phone reality: an Android/iOS handset randomizes its MAC and,
        // on this scan, leaked nothing else (no DHCP capture, no hostname, no
        // service). Rather than fall to "unknown" it should read as a hedged phone.
        assert_eq!(kind(Signals { is_randomized: true, ..Default::default() }), "phone");
        assert_eq!(
            confidence(Signals { is_randomized: true, ..Default::default() }),
            Confidence::Low
        );
        // A stable-MAC device with no signal is still genuinely unknown — the lean
        // is specifically about the randomized population.
        assert_eq!(kind(Signals::default()), "unknown");
    }

    #[test]
    fn a_randomized_lean_never_overrides_a_real_signal() {
        // Any real signal outweighs the last-resort lean, so a randomizing device
        // that DID announce itself keeps its true kind.
        assert_eq!(
            kind(Signals {
                is_randomized: true,
                mdns: Some(&strong("printer")),
                ..Default::default()
            }),
            "printer"
        );
        assert_eq!(
            kind(Signals {
                is_randomized: true,
                hostname: Some("Living-Room-AppleTV"),
                ..Default::default()
            }),
            "tv"
        );
        // ...and a randomizing laptop that serves SSH/SMB stays a computer: the
        // implausible-handheld penalty cancels the phone lean (net-negative), so
        // the weak computer-port vote wins.
        assert_eq!(
            kind(Signals { is_randomized: true, open_ports: &[22, 445], ..Default::default() }),
            "computer"
        );
    }

    #[test]
    fn confidence_separates_decisive_calls_from_hedges() {
        // Role flags and hostname-grade (or better) signals are decisive.
        assert_eq!(confidence(Signals { is_gateway: true, ..Default::default() }), Confidence::High);
        assert_eq!(
            confidence(Signals { hostname: Some("Office-LaserJet"), ..Default::default() }),
            Confidence::High
        );
        assert_eq!(
            confidence(Signals { open_ports: &[80, 9100], ..Default::default() }),
            Confidence::High
        );
        // A lone weak port, the ambiguous Apple-mobile port, or no signal at
        // all is a best guess the UI should hedge.
        assert_eq!(confidence(Signals { open_ports: &[22], ..Default::default() }), Confidence::Low);
        assert_eq!(
            confidence(Signals { open_ports: &[62078], ..Default::default() }),
            Confidence::Low
        );
        assert_eq!(confidence(Signals::default()), Confidence::Low);
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
