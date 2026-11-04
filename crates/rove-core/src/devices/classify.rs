//! Best-effort device typing.
//!
//! Every signal casts a weighted vote and the highest-scoring kind wins. Strong
//! signals (a definitive mDNS service, a print port) decide a device alone; the
//! vote only matters when weaker signals disagree, so corroboration beats a
//! lone noisy guess. Gateway and self short-circuit.
//!
//! Three refinements keep the arithmetic honest:
//! - free text relayed by several protocols (one name echoed as the hostname,
//!   the SSDP friendlyName and the DHCP hostname) votes once: a copied string is
//!   one observation, not corroboration;
//! - an ambiguous signal casts a distribution over kinds (lockdownd: mostly
//!   phone, some tablet and watch) instead of betting on its modal kind;
//! - implausible pairings vote negatively (a host serving SSH, SMB or RDP is
//!   not a wearable), so a lone vendor guess can't drag a general-purpose
//!   machine into a handheld kind.
//!
//! The [`Verdict`]'s [`KindConfidence`] is `Low` when the winner leads by less than
//! one vendor-grade signal and nothing hostname-grade anchors it, so the UI can
//! hedge the label.
use crate::devices::banner::BannerHit;
use crate::devices::dhcp::DhcpHit;
use crate::devices::mdns::MdnsHit;
use crate::devices::ssdp::SsdpHit;
use crate::devices::{DeviceKind, KindConfidence};
use regex_lite::Regex;
use std::sync::LazyLock;

/// Every identity signal gathered for one host, bundled so a new source doesn't
/// reshuffle a positional argument list. All fields default to absent.
#[derive(Default)]
pub struct Signals<'a> {
    /// Vendor from the MAC OUI table.
    pub vendor: Option<&'a str>,
    /// Best display name so far (mDNS, SSDP, NetBIOS, DHCP or reverse DNS).
    pub hostname: Option<&'a str>,
    pub mdns: Option<&'a MdnsHit>,
    pub ssdp: Option<&'a SsdpHit>,
    pub banner: Option<&'a BannerHit>,
    pub dhcp: Option<&'a DhcpHit>,
    pub open_ports: &'a [u16],
    pub is_gateway: bool,
    pub is_self: bool,
}

struct KindPatterns(Vec<(Regex, DeviceKind)>);

impl KindPatterns {
    fn new(table: &[(&str, DeviceKind)]) -> Self {
        Self(
            table
                .iter()
                .map(|(pattern, kind)| (Regex::new(pattern).expect("a valid classifier pattern"), *kind))
                .collect(),
        )
    }

    fn matches(&self, text: &str) -> Option<DeviceKind> {
        self.0.iter().find(|(pattern, _)| pattern.is_match(text)).map(|(_, kind)| *kind)
    }
}

// The first matching row wins, so rows go most specific first: NAS before
// computer, tablet before phone, camera or speaker before IoT. Keep cross-kind
// tokens ("android-tv" against a phone's "android") off the broader kind.
static HOSTNAME_KINDS: LazyLock<KindPatterns> = LazyLock::new(|| {
    KindPatterns::new(&[
        (
            r"(?i)synology|diskstation|\bqnap\b|truenas|freenas|unraid|openmediavault|\bnas\b|nas-|-nas\b|asustor|terramaster|\bdrobo\b|mycloud|readynas",
            DeviceKind::Nas,
        ),
        (
            r"(?i)macbook|imac|mac-?mini|mac-?pro|mac-?studio|\bpc\b|-pc\b|desktop|laptop|thinkpad|ideapad|thinkcentre|optiplex|latitude|inspiron|\bxps\b|alienware|elitebook|probook|\bomen\b|pavilion|zenbook|vivobook|surface|chromebook|chromebox|pixelbook|workstation|\bnuc\b|raspberry|\brpi\b|pi-?hole|steam-?deck|ubuntu|fedora|debian|archlinux|framework|system76|-server\b|server-|\bwin-[0-9a-z]|esxi|proxmox|vmware",
            DeviceKind::Computer,
        ),
        (
            r"(?i)ipad|galaxy-?tab|\bsm-t\d|kindle|fire-?hd|fire-?tablet|-tablet\b|\btablet\b|lenovo-?tab|\btab-[a-z0-9]|mi-?pad|mediapad",
            DeviceKind::Tablet,
        ),
        // Before the phone row, so brand tokens shared with phones ("galaxy
        // watch", "pixel watch") land here.
        (
            r"(?i)\bwatch\b|-watch\b|watch-|apple-?watch|galaxy-?watch|pixel-?watch|smart-?watch|\bsm-r\d|\bgizmo\b|fitbit|charge-?[2-6]\b|inspire-?[23]\b|\bversa\b|amazfit|ticwatch|wear-?os|mi-?band|\bfenix\b|forerunner|vivoactive|vivomove|\bvenu\b|instinct|\bgarmin\b",
            DeviceKind::Watch,
        ),
        (
            r"(?i)iphone|ipod|pixel|galaxy|sm-[a-z]\d|nexus|xperia|oneplus|redmi|\bpoco\b|\biqoo\b|realme|\brmx\d{4}|\bcph\d{4}|\boppo\b|\bvivo\b|\bhonor\b|\bmate-?[1-9]\d?\b|moto[- ]?[ge]|motorola|nokia-?\d|infinix|\btecno\b|zenfone|-phone\b|phone-|android-[0-9a-f]",
            DeviceKind::Phone,
        ),
        (
            r"(?i)\bxbox\b|playstation|\bps[345]\b|psvita|nintendo|-switch\b|switch-|\bwii\b|steam-?link|rog-?ally",
            DeviceKind::Console,
        ),
        (
            r"(?i)appletv|apple-tv|android-?tv|google-?tv|chromecast|nvidia-?shield|\bshield\b|firetv|fire-?tv|fire-?stick|firestick|roku|bravia|aquos|webos|\blg-?tv|samsung-?tv|\btv\b|vizio|\btivo\b|mi-?box|set-?top|projector",
            DeviceKind::Tv,
        ),
        (
            r"(?i)printer|officejet|laserjet|deskjet|\benvy\b|pixma|imageclass|maxify|workforce|ecotank|expression|brother|hl-l|\bmfc-|\bdcp-|epson|\bcanon\b|lexmark|kyocera|\bxerox\b|ricoh|\bzebra\b|scanner|octoprint|\bender-?\d|prusa|bambu-?lab",
            DeviceKind::Printer,
        ),
        (
            r"(?i)camera|webcam|ipcam|\bcam-?\d|-cam\b|doorbell|reolink|amcrest|hikvision|\bdahua\b|\barlo\b|blink-?(cam|mini)|eufycam|nest-?cam|wyze-?cam|wyzecam|ring-doorbell|foscam|ezviz|\bannke\b|\bnvr\b|tapo-?c\d",
            DeviceKind::Camera,
        ),
        (
            r"(?i)\bsonos\b|homepod|\becho\b|\balexa\b|echo-?dot|nest-?mini|nest-?hub|nest-?audio|sound-?bar|\bheos\b|speaker|\bbose\b|\bdenon\b|\bjbl\b|klipsch|bluesound|\bwiim\b|marantz|soundtouch|musiccast|symfonisk",
            DeviceKind::Speaker,
        ),
        (
            r"(?i)esp-?\d|esp32|esp8266|tasmota|shelly|sonoff|tuya|smartlife|kasa|\btapo\b|tapo-|\bhs\d{3}|\bks\d{3}|\bkp\d{3}|\bp1\d{2}\b|wemo|meross|govee|lifx|nanoleaf|\bwiz-|yeelight|tradfri|\bhue\b|philips-?hue|lutron|caseta|ecobee|\bnest\b|thermostat|sensi|wyze|eufy|\bring\b|smartplug|-plug\b|plug-?\d|smartbulb|-bulb\b|light-?\d|smartswitch|vacuum|roborock|roomba|neato|deebot|ecovacs|airfryer|cosori|purifier|humidifier|dishwasher|\bwasher\b|\bdryer\b|fridge|refrigerator|\boven\b|microwave|smartthings|zigbee|z-?wave|\baqara\b|switchbot|\bmyq\b|\bwled\b|broadlink|netatmo|schlage|kwikset|\bnuki\b|door-?lock|doorlock|deadbolt|garage|sprinkler|irrigation|rachio|wallbox|chargepoint|juicebox|\bevse\b|solaredge|enphase|litter-?robot|petcube|blinds|curtain|weather-?station|awair|airthings|-sensor\b|sensor-|smoke-?alarm",
            DeviceKind::Iot,
        ),
        (
            r"(?i)router|gateway|\bap-?\d|access-?point|unifi|\budm\b|\buap\b|openwrt|dd-wrt|mikrotik|\beero\b|\borbi\b|nighthawk|fritz|\bomada\b|\bdeco\b|\bvelop\b|repeater|\bmodem\b|\bont\b|linksys|airport|time-?capsule|extender|\barcher\b|tplink|starlink|gl-?inet|livebox|freebox|xfinity",
            DeviceKind::Router,
        ),
    ])
});

/// Ordered so specific products win over broad brands. Matched against the full
/// IEEE vendor name, so registry spellings like "Signify" appear here.
///
/// TP-Link is deliberately absent: the registry gives its whole catalog one
/// name, so a Kasa plug is indistinguishable by vendor from an Archer router.
/// Rather than mislabel either, a lone TP-Link OUI casts no vote. Real TP-Link
/// gear still types via a stronger signal: the gateway flag, a `deco`, `omada`,
/// `kasa` or `tapo` hostname, or an SSDP type.
static VENDOR_KINDS: LazyLock<KindPatterns> = LazyLock::new(|| {
    KindPatterns::new(&[
        (r"(?i)synology|\bqnap\b|western digital|seagate|\bdrobo\b|terramaster|asustor", DeviceKind::Nas),
        (
            r"(?i)hikvision|\bdahua\b|reolink|amcrest|\blorex\b|axis comm|\bwyze\b|\barlo\b|\bswann\b|uniview|ezviz|foscam|vivotek|hanwha|annke",
            DeviceKind::Camera,
        ),
        (
            r"(?i)sonos|\bbose\b|\bdenon\b|marantz|\bheos\b|sonance|harman|\bjbl\b|bang & olufsen|klipsch|yamaha|\bonkyo\b|bluesound|devialet|\bpolk\b",
            DeviceKind::Speaker,
        ),
        // PlayStation OUIs register as "Sony Interactive Entertainment"; before
        // the TV row, whose broad \bsony\b would claim them.
        (r"(?i)nintendo|sony interactive", DeviceKind::Console),
        // Transsion (Tecno, Infinix, itel) registers as "Shenzhen Transsion …",
        // which the IoT row's shenzhen catch-all would swallow.
        (r"(?i)transsion|hmd global", DeviceKind::Phone),
        (
            r"(?i)espressif|\btuya\b|sonoff|itead|shelly|allterco|\bnest\b|\bring\b|\beufy\b|philips lighting|signify|ecobee|\blifx\b|nanoleaf|govee|yeelight|roborock|ecovacs|irobot|\bneato\b|tradfri|\bikea\b|lutron|leviton|sengled|meross|switchbot|aqara|lumi|\bwiz\b|vesync|cosori|broadlink|netatmo|\bsomfy\b|resideo|honeywell|chamberlain|liftmaster|rachio|rain bird|ledvance|osram|\bmidea\b|\bdyson\b|\bgree\b|daikin|smartthings|samjin|emporia|enphase|solaredge|fronius|growatt|wallbox|chargepoint|ecoflow|\bnuki\b|august home|allegion|schlage|kwikset|shenzhen.*(smart|iot|tech)",
            DeviceKind::Iot,
        ),
        (
            r"(?i)brother|\bcanon\b|epson|lexmark|kyocera|\bxerox\b|ricoh|\bzebra\b|pantum|oki electric",
            DeviceKind::Printer,
        ),
        (
            r"(?i)roku|vizio|lg elec|hisense|\btcl\b|skyworth|funai|\bonn\b|\bsony\b|amlogic|insignia|panasonic|xgimi",
            DeviceKind::Tv,
        ),
        // "Compal Broadband" (cable modems) precedes the computer row's bare
        // "compal", the laptop ODM. Bare "Nokia" OUIs are ISP gateways and ONTs;
        // Nokia phones register as HMD Global.
        (
            r"(?i)zyxel|ubiquiti|netgear|mikrotik|\basus\b|d-link|\baruba\b|\bcisco\b|ruckus|meraki|juniper|fortinet|sonicwall|\barris\b|technicolor|sagemcom|actiontec|\bcalix\b|adtran|\beero\b|turris|\bzte\b|sagem|\btenda\b|hitron|commscope|cambium|engenius|sercomm|\baskey\b|\bhumax\b|vantiva|airties|plume design|compal broadband|\bnokia\b",
            DeviceKind::Router,
        ),
        (
            r"(?i)raspberry|\bintel\b|\bdell\b|lenovo|hp inc|hewlett|framework|gigabyte|\bmsi\b|micro-star|asrock|super ?micro|supermicro|elitegroup|pegatron|\bquanta\b|compal|wistron|\bclevo\b|tuxedo|beelink|minisforum|\bchuwi\b|system76|\bacer\b|fujitsu|lite-?on|azurewave|vmware|parallels|pcs systemtechnik|\bzotac\b",
            DeviceKind::Computer,
        ),
        // Before the phone row, so a Garmin or Fitbit OUI reads as a watch.
        (r"(?i)\bgarmin\b|\bfitbit\b|amazfit|\bhuami\b|mobvoi|\bwithings\b|polar electro", DeviceKind::Watch),
        (
            r"(?i)\bapple\b|samsung|xiaomi|oneplus|huawei|\bhonor\b|\boppo\b|\bvivo\b|realme|motorola|\bhtc\b|nothing tech|fairphone",
            DeviceKind::Phone,
        ),
    ])
});

/// mDNS TXT models like "MacBookPro18,3", "AudioAccessory5,1" or "iPad13,4"
/// are near-definitive product identifiers.
static MODEL_KINDS: LazyLock<KindPatterns> = LazyLock::new(|| {
    KindPatterns::new(&[
        (r"(?i)synology|diskstation|\bqnap\b", DeviceKind::Nas),
        (
            r"(?i)macbook|imac|macmini|mac-?mini|macpro|mac-?studio|macstudio|windows|surface|thinkpad|optiplex|latitude",
            DeviceKind::Computer,
        ),
        (r"(?i)ipad|galaxy-?tab|\bsm-t\d|kindle", DeviceKind::Tablet),
        // Apple Watch reports "Watch6,1" and Samsung watches SM-R models; both
        // must beat the phone row's broader patterns.
        (r"(?i)\bwatch\d|\bsm-r\d", DeviceKind::Watch),
        (r"(?i)iphone|ipod|pixel|galaxy|sm-[a-z]", DeviceKind::Phone),
        (r"(?i)playstation|\bps[45]\b|\bxbox\b|nintendo", DeviceKind::Console),
        (r"(?i)audioaccessory|homepod|sonos|\bspeaker\b|soundbar", DeviceKind::Speaker),
        (r"(?i)\bcamera\b|\bcam\b|doorbell|hikvision|reolink", DeviceKind::Camera),
        (r"(?i)appletv|apple-?tv|shield|chromecast|bravia|roku|firetv|fire-?tv|android-?tv|vizio", DeviceKind::Tv),
        (r"(?i)\bhue\b|bridge|\bplug\b|bulb|sensor|thermostat|roomba|robovac|vacuum", DeviceKind::Iot),
    ])
});

/// UPnP `deviceType` URNs map fairly directly to a kind. MediaRenderer/DIAL are
/// almost always a TV or AV box; `ZonePlayer` is Sonos; the WAN/IGD types are the
/// router (usually already decided by the gateway flag); `MediaServer` leans NAS.
static SSDP_TYPE_KINDS: LazyLock<KindPatterns> = LazyLock::new(|| {
    KindPatterns::new(&[
        (
            r"(?i)InternetGatewayDevice|WANDevice|WANConnectionDevice|LANDevice|WLANAccessPointDevice",
            DeviceKind::Router,
        ),
        (r"(?i)Printer", DeviceKind::Printer),
        (r"(?i)ZonePlayer", DeviceKind::Speaker),
        // Belkin Wemo plugs/switches announce vendor URNs like
        // "urn:Belkin:device:controllee:1".
        (r"(?i)urn:belkin:device", DeviceKind::Iot),
        (r"(?i)MediaRenderer|dial", DeviceKind::Tv),
        (r"(?i)MediaServer", DeviceKind::Nas),
    ])
});

/// A listening service that all but names the device type: 9100 and 631 print,
/// 8060 is Roku control (a TV), 32400 Plex (a NAS-class box), 1400 Sonos. 9999
/// and 6668 are the local APIs of the two largest smart-plug families (Kasa and
/// Tuya), otherwise silent: no mDNS, no SSDP, and an OUI that can't be split.
///
/// Chromecast's 8009 isn't here: the whole Cast family uses it, audio-only
/// speakers included, so it's only a weak TV lean (see [`weak_port_votes`]) and
/// the mDNS `ca` capabilities make the call.
fn strong_port_kind(ports: &[u16]) -> Option<DeviceKind> {
    if ports.iter().any(|&p| matches!(p, 9100 | 631)) {
        return Some(DeviceKind::Printer);
    }
    if ports.contains(&8060) {
        return Some(DeviceKind::Tv);
    }
    if ports.contains(&1400) {
        return Some(DeviceKind::Speaker);
    }
    if ports.contains(&32400) {
        return Some(DeviceKind::Nas);
    }
    if ports.iter().any(|&p| matches!(p, 9999 | 6668)) {
        return Some(DeviceKind::Iot);
    }
    None
}

/// Apple's lockdownd (62078) runs on iPhone, iPad and Apple Watch alike, so it
/// votes a distribution: mostly phone, at a weight a tablet or watch hostname
/// or model still outranks, with minor shares that corroborate it. An Apple
/// Watch that only reverse-resolves to "Watch" isn't flipped to a phone.
fn apple_mobile_port_votes(ports: &[u16]) -> &'static [(DeviceKind, i32)] {
    if ports.contains(&62078) {
        &[(DeviceKind::Phone, W_LOCKDOWND), (DeviceKind::Tablet, 12), (DeviceKind::Watch, 8)]
    } else {
        &[]
    }
}

/// Ports that merely lean one way. RTSP is usually a camera; SSH or SMB a
/// computer or NAS. Cast's 8009 is mostly TVs but also audio-only speakers, so
/// it votes a TV-leaning split that lifts a device out of "unknown" without
/// outweighing a definitive mDNS speaker verdict.
fn weak_port_votes(ports: &[u16]) -> &'static [(DeviceKind, i32)] {
    if ports.contains(&554) {
        return &[(DeviceKind::Camera, W_WEAK_PORT)];
    }
    if ports.iter().any(|&p| matches!(p, 22 | 445)) {
        return &[(DeviceKind::Computer, W_WEAK_PORT)];
    }
    if ports.contains(&8009) {
        return &[(DeviceKind::Tv, W_WEAK_PORT), (DeviceKind::Speaker, 6)];
    }
    &[]
}

/// Negative evidence. No watch, phone or tablet serves SSH, SMB or RDP on a LAN,
/// so those kinds lose enough to cancel a lone vendor guess (an Apple OUI plus
/// SSH reads "computer") but not a handheld hostname or model.
fn implausible_port_votes(ports: &[u16]) -> &'static [(DeviceKind, i32)] {
    if ports.iter().any(|&p| matches!(p, 22 | 445 | 3389)) {
        &[(DeviceKind::Watch, -30), (DeviceKind::Phone, -20), (DeviceKind::Tablet, -15)]
    } else {
        &[]
    }
}

/// Trust weight of each signal. Strong signals outweigh any single weak one, so
/// only several weaker signals agreeing can change an outcome.
const W_MDNS_STRONG: i32 = 100;
const W_MDNS_MODEL: i32 = 60;
const W_STRONG_PORT: i32 = 55;
/// A UPnP `deviceType` is reliable for printers and routers but ambiguous for
/// media (a `MediaRenderer` might be a TV or a soundbar), so it sits below the
/// strong-port vote.
const W_SSDP_TYPE: i32 = 50;
/// A DHCP fingerprint is a hard-to-spoof OS-family signal that survives MAC
/// randomization: just under a UPnP deviceType, above a hostname or vendor.
const W_DHCP: i32 = 45;
const W_HOSTNAME: i32 = 40;
/// Below a hostname or model, so a device that names itself an iPad or Watch
/// keeps that kind (see [`apple_mobile_port_votes`]).
const W_LOCKDOWND: i32 = 30;
const W_VENDOR: i32 = 25;
/// Corroboration, not proof: many devices share an httpd string and titles are
/// often generic ("Login").
const W_BANNER: i32 = 22;
const W_MDNS_HINT: i32 = 15;
const W_WEAK_PORT: i32 = 12;

/// Decisive when the winner leads by at least one vendor-grade signal or rests
/// on one signal of hostname grade or better. Anything thinner is hedged.
const CONFIDENCE_MARGIN: i32 = W_VENDOR;
const CONFIDENCE_ANCHOR: i32 = W_HOSTNAME;

/// Tally slots: one per votable kind, in [`DeviceKind::VOTABLE`]'s tie-break order.
const KIND_COUNT: usize = DeviceKind::VOTABLE.len();

fn kind_index(kind: DeviceKind) -> Option<usize> {
    DeviceKind::VOTABLE.iter().position(|&k| k == kind)
}

pub struct Verdict {
    pub kind: DeviceKind,
    pub confidence: KindConfidence,
}

/// Votes per kind. `best_single` holds each kind's strongest positive signal, to
/// break ties toward the more trustworthy source and to anchor confidence.
#[derive(Default)]
struct Tally {
    total: [i32; KIND_COUNT],
    best_single: [i32; KIND_COUNT],
}

impl Tally {
    fn cast(&mut self, kind: Option<DeviceKind>, weight: i32) {
        if let Some(i) = kind.and_then(kind_index) {
            self.total[i] += weight;
            if weight > 0 {
                self.best_single[i] = self.best_single[i].max(weight);
            }
        }
    }

    fn cast_all(&mut self, votes: &[(DeviceKind, i32)]) {
        for &(kind, weight) in votes {
            self.cast(Some(kind), weight);
        }
    }

    fn verdict(&self) -> Verdict {
        let mut winner: Option<usize> = None;
        for i in 0..KIND_COUNT {
            // Negative evidence can knock a kind out entirely.
            if self.total[i] <= 0 {
                continue;
            }
            let better = match winner {
                None => true,
                Some(w) => (self.total[i], self.best_single[i]) > (self.total[w], self.best_single[w]),
            };
            if better {
                winner = Some(i);
            }
        }
        let Some(w) = winner else {
            return Verdict { kind: DeviceKind::Unknown, confidence: KindConfidence::Low };
        };
        let runner_up = (0..KIND_COUNT).filter(|&i| i != w).map(|i| self.total[i].max(0)).max().unwrap_or(0);
        let decisive = self.total[w] - runner_up >= CONFIDENCE_MARGIN || self.best_single[w] >= CONFIDENCE_ANCHOR;
        Verdict {
            kind: DeviceKind::VOTABLE[w],
            confidence: if decisive { KindConfidence::High } else { KindConfidence::Low },
        }
    }
}

/// One free-text vote channel that skips strings already cast: the display
/// hostname may be the SSDP friendlyName or the DHCP hostname, and the same text
/// relayed twice is one observation. Cast the highest-weight slot first so a
/// duplicate keeps its strongest reading.
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
        return Verdict { kind: DeviceKind::Router, confidence: KindConfidence::High };
    }
    if s.is_self {
        return Verdict { kind: DeviceKind::Computer, confidence: KindConfidence::High };
    }

    let Signals { vendor, hostname, mdns, ssdp, banner, dhcp, open_ports, .. } = *s;

    let mut tally = Tally::default();

    tally.cast(mdns.and_then(|hit| hit.kind), W_MDNS_STRONG);
    tally.cast(strong_port_kind(open_ports), W_STRONG_PORT);
    // SSDP's model, name and manufacturer join the free-text channels below.
    tally.cast(ssdp.and_then(|hit| hit.device_type.as_deref()).and_then(|t| SSDP_TYPE_KINDS.matches(t)), W_SSDP_TYPE);
    // DHCP's vendor class and hostname join them too.
    tally.cast(dhcp.and_then(|hit| hit.kind), W_DHCP);
    tally.cast(mdns.and_then(|hit| hit.kind_hint), W_MDNS_HINT);

    let mut models = TextChannel::new(&MODEL_KINDS);
    models.vote(&mut tally, mdns.and_then(|hit| hit.model.as_deref()), W_MDNS_MODEL);
    models.vote(&mut tally, ssdp.and_then(|hit| hit.model.as_deref()), W_MDNS_MODEL);

    let mut names = TextChannel::new(&HOSTNAME_KINDS);
    names.vote(&mut tally, hostname, W_HOSTNAME);
    names.vote(&mut tally, ssdp.and_then(|hit| hit.name.as_deref()), W_HOSTNAME);
    names.vote(&mut tally, dhcp.and_then(|hit| hit.hostname.as_deref()), W_HOSTNAME);
    names.vote(&mut tally, banner.and_then(|b| b.title.as_deref()), W_BANNER);

    let mut vendors = TextChannel::new(&VENDOR_KINDS);
    vendors.vote(&mut tally, vendor, W_VENDOR);
    vendors.vote(&mut tally, ssdp.and_then(|hit| hit.manufacturer.as_deref()), W_VENDOR);
    vendors.vote(&mut tally, dhcp.and_then(|hit| hit.vendor_class.as_deref()), W_VENDOR);

    // An owned join of Server header and title, so it bypasses the channels.
    if let Some(identity) = banner.and_then(|b| b.identity()) {
        tally.cast(VENDOR_KINDS.matches(&identity).or_else(|| HOSTNAME_KINDS.matches(&identity)), W_BANNER);
    }

    tally.cast_all(apple_mobile_port_votes(open_ports));
    tally.cast_all(weak_port_votes(open_ports));
    tally.cast_all(implausible_port_votes(open_ports));

    tally.verdict()
}

#[cfg(test)]
mod tests;
