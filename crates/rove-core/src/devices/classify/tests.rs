use super::*;
use crate::devices::dhcp::DhcpHit;
use crate::devices::mdns::MdnsHit;

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
fn a_signalless_device_stays_unknown() {
    // A device that leaked nothing the classifier can read — including a
    // silent privacy-randomized handset — must stay "unknown" (the UI renders
    // it as a generic device), never a guessed kind. We only name what we can
    // actually identify.
    assert_eq!(kind(Signals::default()), "unknown");
    assert_eq!(confidence(Signals::default()), Confidence::Low);
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
