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
use crate::devices::mdns::MdnsHit;
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

    tally.verdict()
}

#[cfg(test)]
mod tests;
