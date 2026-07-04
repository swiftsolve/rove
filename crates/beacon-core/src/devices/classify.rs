//! Best-effort device typing. Signals in order of trust:
//! role flags > mDNS service type > mDNS hardware model > hostname > vendor
//! OUI > weak mDNS hints. Anything else is honestly "unknown".
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

static HOSTNAME_KINDS: LazyLock<KindPatterns> = LazyLock::new(|| {
    KindPatterns::new(&[
        (r"(?i)iphone|ipad|pixel|galaxy|android|oneplus|redmi|phone", "phone"),
        (r"(?i)macbook|imac|desktop|laptop|thinkpad|workstation|nuc", "computer"),
        (r"(?i)appletv|apple-tv|roku|chromecast|shield|firetv|fire-tv|bravia|webos", "tv"),
        (r"(?i)printer|officejet|laserjet|deskjet|brother|epson", "printer"),
        (
            r"(?i)^hs\d{3}|^ks\d{3}|kasa|wemo|ecobee|cosori|airfryer|vacuum|roomba|thermostat|doorbell|esp[-_]?\d|tasmota|shelly|sonoff|plug|cam",
            "iot",
        ),
        (r"(?i)router|gateway|unifi|openwrt|mikrotik", "router"),
    ])
});

/// Ordered so specific products win over broad brands (a Kasa plug is IoT,
/// not a router, even though TP-Link mostly makes routers).
static VENDOR_KINDS: LazyLock<KindPatterns> = LazyLock::new(|| {
    KindPatterns::new(&[
        (
            r"(?i)kasa|vesync|cosori|espressif|tuya|sonoff|nest|amazon|google|ring|wyze|philips hue|shelly|sonos",
            "iot",
        ),
        (r"(?i)brother|canon|epson|lexmark", "printer"),
        (r"(?i)roku|vizio|lg elec|hisense|tcl|sony|nintendo|chromecast", "tv"),
        (r"(?i)zyxel|tp-link|ubiquiti|netgear|mikrotik|asus|router|d-link|aruba|cisco", "router"),
        (r"(?i)raspberry|intel|dell|lenovo|hp\b|framework|gigabyte|msi", "computer"),
        (r"(?i)apple|samsung|xiaomi|oneplus|huawei|oppo|motorola", "phone"),
    ])
});

/// mDNS TXT models like "MacBookPro18,3" or "AppleTV6,2" are near-definitive.
static MODEL_KINDS: LazyLock<KindPatterns> = LazyLock::new(|| {
    KindPatterns::new(&[
        (r"(?i)macbook|imac|macmini|macpro|windows|surface", "computer"),
        (r"(?i)appletv|shield|chromecast|bravia|roku", "tv"),
        (r"(?i)iphone|ipad|pixel|galaxy", "phone"),
        (r"(?i)hue|bridge|plug|bulb|sensor|thermostat", "iot"),
    ])
});

pub fn classify(
    vendor: Option<&str>,
    hostname: Option<&str>,
    mdns: Option<&MdnsHit>,
    is_gateway: bool,
    is_self: bool,
) -> String {
    if is_gateway {
        return "router".into();
    }
    if is_self {
        return "computer".into();
    }

    mdns.and_then(|hit| hit.kind)
        .or_else(|| mdns.and_then(|hit| hit.model.as_deref()).and_then(|m| MODEL_KINDS.matches(m)))
        .or_else(|| hostname.and_then(|h| HOSTNAME_KINDS.matches(h)))
        .or_else(|| vendor.and_then(|v| VENDOR_KINDS.matches(v)))
        .or_else(|| mdns.and_then(|hit| hit.kind_hint))
        .unwrap_or("unknown")
        .into()
}
