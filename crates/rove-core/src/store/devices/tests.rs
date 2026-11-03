use super::*;

#[test]
fn devices_upsert_preserves_first_seen_and_hostname() {
    let store = Store::open_in_memory().unwrap();
    let mut device = LanDevice {
        ip: "192.168.1.5".into(),
        mac: "aa:bb:cc:dd:ee:ff".into(),
        vendor: Some("Acme".into()),
        hostname: Some("nas".into()),
        model: None,
        os: None,
        kind: "computer".into(),
        kind_confidence: "high",
        is_randomized_mac: false,
        is_gateway: false,
        is_self: false,
        is_reachable: true,
        last_seen: None,
    };
    store.record_devices(std::slice::from_ref(&device), 1000).unwrap();
    device.hostname = None; // a later scan that couldn't resolve the name
    device.ip = "192.168.1.9".into();
    store.record_devices(std::slice::from_ref(&device), 2000).unwrap();

    let known = store.known_devices().unwrap();
    assert_eq!(known.len(), 1);
    assert_eq!(known[0].first_seen, 1000);
    assert_eq!(known[0].last_seen, 2000);
    assert_eq!(known[0].ip.as_deref(), Some("192.168.1.9"));
    assert_eq!(known[0].hostname.as_deref(), Some("nas"));
}

#[test]
fn a_silent_scan_does_not_erase_a_known_kind() {
    let store = Store::open_in_memory().unwrap();
    let mut phone = device("bb:bb:bb:bb:bb:bb", "192.168.2.14", "phone");
    phone.os = Some("Android".into());
    store.record_devices(std::slice::from_ref(&phone), 1_000).unwrap();

    // A later scan can't classify it (asleep, announcing nothing) so it comes
    // back as a bare unknown. The remembered "phone"/"Android" must survive.
    let mut silent = device("bb:bb:bb:bb:bb:bb", "192.168.2.14", "unknown");
    silent.os = None;
    store.record_devices(std::slice::from_ref(&silent), 2_000).unwrap();

    let known = store.known_devices().unwrap();
    assert_eq!(known[0].kind, "phone", "a failed classify keeps the settled kind");
    assert_eq!(known[0].os.as_deref(), Some("Android"), "and the stored OS");
}

#[test]
fn an_unreachable_live_device_keeps_its_last_known_identity() {
    let store = Store::open_in_memory().unwrap();
    let mut phone = device("bb:bb:bb:bb:bb:bb", "192.168.2.14", "phone");
    phone.os = Some("Android".into());
    phone.hostname = Some("Janes-Phone".into());
    store.record_devices(std::slice::from_ref(&phone), 1_000).unwrap();

    // Still in the ARP table but no longer answering — the fresh scan rebuilt
    // it as a bare "Generic device" (no hostname/os, kind unknown). The merge
    // must restore its remembered identity rather than surface the bare row.
    let mut silent = device("bb:bb:bb:bb:bb:bb", "192.168.2.14", "unknown");
    silent.hostname = None;
    silent.os = None;
    silent.is_reachable = false;
    store.record_devices(std::slice::from_ref(&silent), 2_000).unwrap();

    let merged =
        store.devices_with_offline(std::slice::from_ref(&silent), 2_000, OFFLINE_LIST_KEEP_MS).unwrap();
    let row = merged.iter().find(|d| d.mac == "bb:bb:bb:bb:bb:bb").unwrap();
    assert!(!row.is_reachable, "it still reads offline");
    assert_eq!(row.kind, "phone", "with its remembered kind, not unknown");
    assert_eq!(row.os.as_deref(), Some("Android"), "its remembered OS");
    assert_eq!(row.hostname.as_deref(), Some("Janes-Phone"), "and its remembered name");
}

#[test]
fn an_offline_row_with_an_unknown_kind_is_not_guessed_from_the_vendor() {
    // The complement to the preservation tests: when the stored kind really is
    // "unknown" — a randomized-MAC device we only ever pinned to a vendor
    // ("Apple") — the offline row must stay Unknown, not be guessed into a
    // "phone" from the vendor alone. An Apple host could be a Mac, iPad, TV or
    // watch; we surface only what we actually identified.
    let store = Store::open_in_memory().unwrap();
    let mut vendor_only = device("ae:4a:06:fe:b5:37", "192.168.2.14", "unknown");
    vendor_only.vendor = Some("Apple".into());
    vendor_only.is_randomized_mac = true;
    store.record_devices(std::slice::from_ref(&vendor_only), 1_000).unwrap();

    let merged = store.devices_with_offline(&[], 2_000, OFFLINE_LIST_KEEP_MS).unwrap();
    let row = merged.iter().find(|d| d.mac == "ae:4a:06:fe:b5:37").unwrap();
    assert_eq!(row.vendor.as_deref(), Some("Apple"), "the vendor is remembered");
    assert_eq!(row.kind, "unknown", "but the kind is not invented from it");
}

fn device(mac: &str, ip: &str, kind: &str) -> LanDevice {
    LanDevice {
        ip: ip.into(),
        mac: mac.into(),
        vendor: None,
        hostname: None,
        model: None,
        os: None,
        kind: kind.into(),
        kind_confidence: "high",
        is_randomized_mac: false,
        is_gateway: false,
        is_self: false,
        is_reachable: true,
        last_seen: None,
    }
}

#[test]
fn derives_join_change_offline_and_gateway_events() {
    let store = Store::open_in_memory().unwrap();
    let mut gw = device("00:00:00:00:00:01", "192.168.1.1", "router");
    gw.is_gateway = true;
    let phone = device("aa:aa:aa:aa:aa:aa", "192.168.1.20", "phone");

    // First scan seeds the feed with a single baseline summary ("2 devices"),
    // not a per-device burst.
    store.record_devices(&[gw.clone(), phone.clone()], 1_000).unwrap();
    let seeded = store.network_events(100).unwrap();
    assert_eq!(seeded.len(), 1);
    assert_eq!(seeded[0].event_type, "initial_scan");
    assert_eq!(seeded[0].new_value.as_deref(), Some("2"));

    // A new laptop arrives → one join event, on top of the baseline.
    let mut laptop = device("bb:bb:bb:bb:bb:bb", "192.168.1.30", "computer");
    laptop.hostname = Some("laptop-01".into());
    store
        .record_devices(&[gw.clone(), phone.clone(), laptop.clone()], 2_000)
        .unwrap();
    let latest = store.network_events(1).unwrap();
    assert_eq!(latest[0].event_type, "device_joined");
    assert_eq!(latest[0].mac.as_deref(), Some("bb:bb:bb:bb:bb:bb"));

    // The laptop reports a new hostname → no event (renames were too noisy,
    // so identity changes no longer surface at all).
    let mut renamed = laptop.clone();
    renamed.hostname = Some("laptop-02".into());
    let before_rename = store.network_events(100).unwrap().len();
    store
        .record_devices(&[gw.clone(), phone.clone(), renamed.clone()], 3_000)
        .unwrap();
    assert_eq!(
        store.network_events(100).unwrap().len(),
        before_rename,
        "hostname changes are silent now"
    );

    // A plain IP change now produces no event.
    let mut moved = renamed.clone();
    moved.ip = "192.168.1.31".into();
    let before = store.network_events(100).unwrap().len();
    store
        .record_devices(&[gw.clone(), phone.clone(), moved.clone()], 3_500)
        .unwrap();
    assert_eq!(store.network_events(100).unwrap().len(), before, "IP changes are silent now");

    // The laptop drops off (still within the offline-recency window) → offline.
    store.record_devices(&[gw.clone(), phone.clone()], 4_000).unwrap();
    assert_eq!(store.network_events(1).unwrap()[0].event_type, "device_offline");

    // …and returns → online, not a fresh join.
    store
        .record_devices(&[gw.clone(), phone.clone(), moved.clone()], 5_000)
        .unwrap();
    assert_eq!(store.network_events(1).unwrap()[0].event_type, "device_online");

    // The gateway's MAC changes under us → a critical gateway_changed.
    let mut gw2 = gw.clone();
    gw2.mac = "00:00:00:00:00:02".into();
    store
        .record_devices(&[gw2, phone.clone(), moved.clone()], 6_000)
        .unwrap();
    let latest = &store.network_events(1).unwrap()[0];
    assert_eq!(latest.event_type, "gateway_changed");
    assert_eq!(latest.severity, "critical");
}

#[test]
fn touch_devices_no_ops_until_an_active_scan_seeds_the_roster() {
    let store = Store::open_in_memory().unwrap();
    let seen = device("aa:aa:aa:aa:aa:aa", "192.168.1.10", "unknown");
    // No baseline yet: a passive pass must not seed the roster (that's the
    // first active scan's job), or that scan would report every silent host
    // it finds as a fresh arrival.
    store.touch_devices(std::slice::from_ref(&seen), 1_000).unwrap();
    assert!(store.known_devices().unwrap().is_empty());
    assert!(store.network_events(100).unwrap().is_empty());
}

#[test]
fn touch_devices_bumps_last_seen_without_touching_identity() {
    let store = Store::open_in_memory().unwrap();
    let mut phone = device("bb:bb:bb:bb:bb:bb", "192.168.2.14", "phone");
    phone.hostname = Some("Janes-Phone".into());
    phone.vendor = Some("Apple".into());
    store.record_devices(std::slice::from_ref(&phone), 1_000).unwrap();

    // A passive sighting carries only thin evidence (no hostname, kind
    // unknown). It must advance last_seen/ip yet leave the richer identity an
    // active scan resolved exactly as it was.
    let mut passive = device("bb:bb:bb:bb:bb:bb", "192.168.2.20", "unknown");
    passive.hostname = None;
    passive.vendor = None;
    store.touch_devices(std::slice::from_ref(&passive), 5_000).unwrap();

    let known = store.known_devices().unwrap();
    assert_eq!(known.len(), 1);
    assert_eq!(known[0].last_seen, 5_000, "last_seen advances");
    assert_eq!(known[0].ip.as_deref(), Some("192.168.2.20"), "and so does the IP");
    assert_eq!(known[0].hostname.as_deref(), Some("Janes-Phone"), "identity untouched");
    assert_eq!(known[0].kind, "phone");
    assert_eq!(known[0].vendor.as_deref(), Some("Apple"));
}

#[test]
fn touch_devices_never_marks_an_absent_device_offline() {
    let store = Store::open_in_memory().unwrap();
    let a = device("aa:aa:aa:aa:aa:aa", "192.168.1.10", "phone");
    let b = device("bb:bb:bb:bb:bb:bb", "192.168.1.11", "computer");
    store.record_devices(&[a.clone(), b.clone()], 1_000).unwrap(); // baseline
    let before = store.network_events(100).unwrap().len();

    // A passive pass that only saw `a` must not declare `b` gone — passive
    // discovery can't prove absence, so it only ever adds presence.
    store.touch_devices(std::slice::from_ref(&a), 2_000).unwrap();
    let events = store.network_events(100).unwrap();
    assert_eq!(events.len(), before, "no event for the device it didn't see");
    assert!(events.iter().all(|e| e.event_type != "device_offline"));
}

#[test]
fn touch_devices_re_flags_a_returning_device_online() {
    let store = Store::open_in_memory().unwrap();
    let a = device("aa:aa:aa:aa:aa:aa", "192.168.1.10", "phone");
    let b = device("bb:bb:bb:bb:bb:bb", "192.168.1.11", "computer");
    store.record_devices(&[a.clone(), b.clone()], 1_000).unwrap(); // baseline
    store.record_devices(std::slice::from_ref(&a), 2_000).unwrap(); // b drops → offline
    assert_eq!(store.network_events(1).unwrap()[0].event_type, "device_offline");

    // b is seen again by a passive pass → an online transition still lands on
    // the feed even though no active scan ran.
    store.touch_devices(std::slice::from_ref(&b), 3_000).unwrap();
    assert_eq!(store.network_events(1).unwrap()[0].event_type, "device_online");
}

#[test]
fn touch_devices_records_a_genuinely_new_arrival() {
    let store = Store::open_in_memory().unwrap();
    let a = device("aa:aa:aa:aa:aa:aa", "192.168.1.10", "phone");
    store.record_devices(std::slice::from_ref(&a), 1_000).unwrap(); // baseline exists

    // A device that joined while the app sat in the tray, caught passively.
    let mut newcomer = device("cc:cc:cc:cc:cc:cc", "192.168.1.42", "unknown");
    newcomer.hostname = Some("new-tv".into());
    store.touch_devices(std::slice::from_ref(&newcomer), 2_000).unwrap();

    assert!(
        store.known_devices().unwrap().iter().any(|d| d.mac == "cc:cc:cc:cc:cc:cc"),
        "the arrival is recorded"
    );
    assert_eq!(store.network_events(1).unwrap()[0].event_type, "device_joined");
}

#[test]
fn touch_devices_flags_a_new_router_as_an_ap_appeared_warning() {
    let store = Store::open_in_memory().unwrap();
    let baseline = device("aa:aa:aa:aa:aa:aa", "192.168.1.10", "phone");
    store.record_devices(std::slice::from_ref(&baseline), 1_000).unwrap();

    // A router-kind arrival caught passively (the classify pass typed it as a
    // router, not left it unknown) must land as the higher-severity
    // ap_appeared warning, not a plain join.
    let ap = device("dd:dd:dd:dd:dd:dd", "192.168.1.2", "router");
    store.touch_devices(std::slice::from_ref(&ap), 2_000).unwrap();
    let latest = &store.network_events(1).unwrap()[0];
    assert_eq!(latest.event_type, "ap_appeared");
    assert_eq!(latest.severity, "warning");
}

#[test]
fn offline_is_not_re_emitted_and_stale_devices_never_fire() {
    let store = Store::open_in_memory().unwrap();
    let a = device("aa:aa:aa:aa:aa:aa", "192.168.1.10", "phone");
    let b = device("bb:bb:bb:bb:bb:bb", "192.168.1.11", "computer");

    store.record_devices(&[a.clone(), b.clone()], 1_000).unwrap(); // baseline
    store.record_devices(std::slice::from_ref(&a), 2_000).unwrap(); // b drops → offline
    store.record_devices(std::slice::from_ref(&a), 3_000).unwrap(); // still gone → no repeat
    let offline: Vec<_> = store
        .network_events(100)
        .unwrap()
        .into_iter()
        .filter(|e| e.event_type == "device_offline")
        .collect();
    assert_eq!(offline.len(), 1, "offline should fire once, not every scan");

    // A device last seen long ago (beyond the recency window) is the
    // historical roster, not a fresh drop — a scan without it stays quiet.
    let stale = device("cc:cc:cc:cc:cc:cc", "192.168.1.12", "tv");
    let long_ago = 10_000;
    store.record_devices(&[a.clone(), stale], long_ago).unwrap();
    let much_later = long_ago + OFFLINE_RECENCY_MS + 60_000;
    let before = store.network_events(100).unwrap().len();
    store.record_devices(&[a], much_later).unwrap();
    assert_eq!(
        store.network_events(100).unwrap().len(),
        before,
        "a device beyond the recency window must not emit an offline event"
    );
}

#[test]
fn an_offline_scan_does_not_fire_a_departure_for_every_device() {
    let store = Store::open_in_memory().unwrap();
    let mut gw = device("00:00:00:00:00:01", "192.168.1.1", "router");
    gw.is_gateway = true;
    let phone = device("aa:aa:aa:aa:aa:aa", "192.168.1.20", "phone");
    let laptop = device("bb:bb:bb:bb:bb:bb", "192.168.1.30", "computer");

    store.record_devices(&[gw.clone(), phone.clone(), laptop.clone()], 1_000).unwrap(); // baseline

    // Going offline: the scan confirms nobody — not even self or the gateway
    // (all unreachable). Model that as the stale roster with reachable=false,
    // which is what a scan yields with no uplink. No per-device offline burst
    // should fire — the machine left, the LAN didn't empty out.
    let offline_scan: Vec<LanDevice> = [gw, phone, laptop]
        .into_iter()
        .map(|mut d| {
            d.is_reachable = false;
            d
        })
        .collect();
    store.record_devices(&offline_scan, 2_000).unwrap();

    let offline = store
        .network_events(100)
        .unwrap()
        .into_iter()
        .filter(|e| e.event_type == "device_offline")
        .count();
    assert_eq!(offline, 0, "an offline scan must not mark every device departed");

    // Back online — everyone answers again. They were never marked offline, so
    // there's no spurious reconnect flurry either.
    let back = [
        device("00:00:00:00:00:01", "192.168.1.1", "router"),
        device("aa:aa:aa:aa:aa:aa", "192.168.1.20", "phone"),
        device("bb:bb:bb:bb:bb:bb", "192.168.1.30", "computer"),
    ];
    store.record_devices(&back, 3_000).unwrap();
    let online = store
        .network_events(100)
        .unwrap()
        .into_iter()
        .filter(|e| e.event_type == "device_online")
        .count();
    assert_eq!(online, 0, "devices that were never marked offline don't 'reconnect'");
}

#[test]
fn a_disconnected_host_does_not_fire_departures_for_peers() {
    // The macOS case behind the flood: when the uplink drops, a scan still
    // enumerates `self` as reachable, so `live` is non-empty and the
    // empty-scan guard alone misses it. The host's recorded connection state
    // (`disconnected`) must suppress the per-device offline burst — only the
    // single `connection_lost` event should stand in for the drop.
    let store = Store::open_in_memory().unwrap();
    store.record_connection("wifi", Some("home"), None, None, None, 500).unwrap();
    let mut me = device("00:00:00:00:00:0a", "192.168.1.5", "computer");
    me.is_self = true;
    let phone = device("aa:aa:aa:aa:aa:aa", "192.168.1.20", "phone");
    let laptop = device("bb:bb:bb:bb:bb:bb", "192.168.1.30", "computer");

    store
        .record_devices(&[me.clone(), phone.clone(), laptop.clone()], 1_000)
        .unwrap(); // baseline

    // Uplink drops: the host is now disconnected, and the next scan sees only
    // self (still reachable), with the real peers gone unreachable.
    store.record_connection("disconnected", None, None, None, None, 2_000).unwrap();
    let phone_gone = LanDevice { is_reachable: false, ..phone };
    let laptop_gone = LanDevice { is_reachable: false, ..laptop };
    store.record_devices(&[me, phone_gone, laptop_gone], 3_000).unwrap();

    let offline = store
        .network_events(100)
        .unwrap()
        .into_iter()
        .filter(|e| e.event_type == "device_offline")
        .count();
    assert_eq!(offline, 0, "a disconnected host must not mark its peers departed");
}

#[test]
fn a_real_departure_still_fires_when_others_remain_reachable() {
    // The guard keys on *nothing* being reachable. As long as at least one
    // device answered (here the gateway), a genuinely absent device is still a
    // real departure and must fire — the offline suppression must not swallow it.
    let store = Store::open_in_memory().unwrap();
    let mut gw = device("00:00:00:00:00:01", "192.168.1.1", "router");
    gw.is_gateway = true;
    let phone = device("aa:aa:aa:aa:aa:aa", "192.168.1.20", "phone");

    store.record_devices(&[gw.clone(), phone.clone()], 1_000).unwrap(); // baseline
    store.record_devices(&[gw], 2_000).unwrap(); // phone leaves, gateway stays
    let latest = &store.network_events(1).unwrap()[0];
    assert_eq!(latest.event_type, "device_offline");
    assert_eq!(latest.mac.as_deref(), Some("aa:aa:aa:aa:aa:aa"));
}

#[test]
fn devices_with_offline_keeps_recent_departures_and_drops_stale_ones() {
    let store = Store::open_in_memory().unwrap();
    let here = device("aa:aa:aa:aa:aa:aa", "192.168.1.10", "computer");
    let recent = device("bb:bb:bb:bb:bb:bb", "192.168.1.20", "phone");
    let ancient = device("cc:cc:cc:cc:cc:cc", "192.168.1.30", "tv");

    // Seed the roster: the TV was last seen two days ago, the phone a minute
    // ago, and the computer is here now.
    let now = 3 * OFFLINE_LIST_KEEP_MS; // comfortably past both timestamps
    store.record_devices(&[ancient], now - 2 * OFFLINE_LIST_KEEP_MS).unwrap();
    store.record_devices(std::slice::from_ref(&recent), now - 60_000).unwrap();
    store.record_devices(std::slice::from_ref(&here), now).unwrap();

    // Only the computer answered this scan; merge fills in the phone (recent)
    // but not the TV (beyond the 24h window).
    let merged = store.devices_with_offline(std::slice::from_ref(&here), now, OFFLINE_LIST_KEEP_MS).unwrap();
    let by_mac = |m: &str| merged.iter().find(|d| d.mac == m).cloned();

    let online = by_mac("aa:aa:aa:aa:aa:aa").unwrap();
    assert!(online.is_reachable, "the live device stays reachable");
    assert_eq!(online.last_seen, Some(now), "and is stamped with this scan");

    let offline = by_mac("bb:bb:bb:bb:bb:bb").expect("recent departure is kept");
    assert!(!offline.is_reachable, "a merged roster device reads offline");
    assert_eq!(offline.kind, "phone", "carrying its stored identity");
    assert_eq!(offline.last_seen, Some(now - 60_000), "with its real last-seen time");

    assert!(by_mac("cc:cc:cc:cc:cc:cc").is_none(), "a device gone > 24h drops off the list");
    assert!(store.known_devices().unwrap().iter().any(|k| k.mac == "cc:cc:cc:cc:cc:cc"),
        "but its roster row is retained in the DB");
}

#[test]
fn a_present_but_unreachable_device_goes_offline_on_the_feed() {
    let store = Store::open_in_memory().unwrap();
    let keep = device("aa:aa:aa:aa:aa:aa", "192.168.1.10", "computer");
    let phone = device("bb:bb:bb:bb:bb:bb", "192.168.1.20", "phone");

    store.record_devices(&[keep.clone(), phone.clone()], 1_000).unwrap(); // baseline

    // The phone stops answering probes but is still in the ARP table — it's
    // in the scan with reachable=false ("Offline" in the Devices view). The
    // feed must reflect that, not wait for the device to vanish entirely.
    let mut asleep = phone.clone();
    asleep.is_reachable = false;
    store.record_devices(&[keep.clone(), asleep.clone()], 2_000).unwrap();

    let latest = &store.network_events(1).unwrap()[0];
    assert_eq!(latest.event_type, "device_offline");
    assert_eq!(latest.mac.as_deref(), Some("bb:bb:bb:bb:bb:bb"));

    // Still present, still unreachable → no second offline, no spurious online.
    store.record_devices(&[keep.clone(), asleep.clone()], 3_000).unwrap();
    let offline_count = store
        .network_events(100)
        .unwrap()
        .iter()
        .filter(|e| e.event_type == "device_offline" && e.mac.as_deref() == Some("bb:bb:bb:bb:bb:bb"))
        .count();
    assert_eq!(offline_count, 1, "offline fires once while it stays unreachable");

    // It answers again → device_online.
    store.record_devices(&[keep.clone(), phone.clone()], 4_000).unwrap();
    assert_eq!(store.network_events(1).unwrap()[0].event_type, "device_online");
}

#[test]
fn a_device_back_in_arp_but_still_silent_is_not_a_reconnect() {
    let store = Store::open_in_memory().unwrap();
    let keep = device("aa:aa:aa:aa:aa:aa", "192.168.1.10", "computer");
    let phone = device("bb:bb:bb:bb:bb:bb", "192.168.1.20", "phone");

    store.record_devices(&[keep.clone(), phone.clone()], 1_000).unwrap(); // baseline
    store.record_devices(std::slice::from_ref(&keep), 2_000).unwrap(); // vanishes → offline
    assert_eq!(store.network_events(1).unwrap()[0].event_type, "device_offline");

    // Reappears in the ARP table but still isn't answering (reachable=false)
    // → not a reconnect; it stays offline on the feed.
    let mut silent = phone.clone();
    silent.is_reachable = false;
    let before = store.network_events(100).unwrap().len();
    store.record_devices(&[keep.clone(), silent], 3_000).unwrap();
    assert_eq!(
        store.network_events(100).unwrap().len(),
        before,
        "a silent return is neither a new offline nor an online"
    );
}

#[test]
fn a_departed_randomized_device_keeps_its_live_label() {
    let store = Store::open_in_memory().unwrap();
    let keep = device("aa:aa:aa:aa:aa:aa", "192.168.1.10", "computer");

    // A randomized-MAC phone with no hostname/vendor, but the DHCP
    // fingerprint gave up its OS and the classifier its kind — exactly the
    // signals the live Devices view stitches into "Android phone".
    let mut phone = device("1a:78:49:c6:0d:df", "192.168.1.20", "phone");
    phone.is_randomized_mac = true;
    phone.os = Some("Android".into());

    store.record_devices(&[keep.clone(), phone.clone()], 1_000).unwrap(); // baseline
    store.record_devices(std::slice::from_ref(&keep), 2_000).unwrap(); // phone drops off

    let offline = &store.network_events(1).unwrap()[0];
    assert_eq!(offline.event_type, "device_offline");
    // The departure carries the same label the device showed while live,
    // instead of a null name the UI would render as "Unknown device"…
    assert_eq!(offline.name.as_deref(), Some("Android phone"));
    // …and the randomized flag survives from the stored row.
    assert!(offline.is_randomized);
}

#[test]
fn a_vendor_known_device_keeps_its_kind_in_the_name() {
    let store = Store::open_in_memory().unwrap();
    let keep = device("aa:aa:aa:aa:aa:aa", "192.168.1.10", "computer");

    // An Apple phone with a known maker but no hostname — the case where the
    // vendor used to swallow the kind, reading "Apple" instead of "Phone".
    let mut phone = device("1a:78:49:c6:0d:df", "192.168.1.20", "phone");
    phone.vendor = Some("Apple".into());
    phone.is_randomized_mac = true;

    store.record_devices(&[keep.clone(), phone.clone()], 1_000).unwrap(); // baseline
    store.record_devices(std::slice::from_ref(&keep), 2_000).unwrap(); // phone departs

    let offline = &store.network_events(1).unwrap()[0];
    assert_eq!(offline.event_type, "device_offline");
    assert_eq!(
        offline.name.as_deref(),
        Some("Apple · Phone"),
        "the kind stays beside the maker instead of being replaced by it"
    );
}

#[test]
fn a_departed_anonymous_randomized_device_still_reads_private() {
    let store = Store::open_in_memory().unwrap();
    let keep = device("aa:aa:aa:aa:aa:aa", "192.168.1.10", "computer");

    // Nothing was ever learned — no hostname, vendor, OS, or kind. The name
    // stays null so the UI falls back to "Private device" from the
    // randomized flag, matching how the device read when it joined.
    let mut ghost = device("1a:78:49:c6:0d:df", "192.168.1.20", "unknown");
    ghost.is_randomized_mac = true;

    store.record_devices(&[keep.clone(), ghost.clone()], 1_000).unwrap();
    store.record_devices(std::slice::from_ref(&keep), 2_000).unwrap();

    let offline = &store.network_events(1).unwrap()[0];
    assert_eq!(offline.event_type, "device_offline");
    assert_eq!(offline.name, None, "no identity to snapshot");
    assert!(offline.is_randomized, "so the UI can still show 'Private device'");
}

#[test]
fn a_past_offline_relabels_once_the_classifier_catches_up() {
    let store = Store::open_in_memory().unwrap();
    let keep = device("aa:aa:aa:aa:aa:aa", "192.168.1.10", "computer");

    // First sight of a randomized phone is thin — no hostname/vendor/OS and
    // the classifier hasn't committed to a kind. It joins, then drops off,
    // recording an offline row with no identity ("Private device" in the UI).
    let mut thin = device("1a:78:49:c6:0d:df", "192.168.1.20", "unknown");
    thin.is_randomized_mac = true;
    store.record_devices(&[keep.clone(), thin.clone()], 1_000).unwrap(); // baseline
    store.record_devices(std::slice::from_ref(&keep), 2_000).unwrap(); // drops off, thin

    let offline_id = {
        let e = &store.network_events(1).unwrap()[0];
        assert_eq!(e.event_type, "device_offline");
        assert_eq!(e.name, None, "nothing known yet");
        e.id
    };

    // It returns and this scan's evidence pins it: Android, a phone. The
    // roster now carries that identity…
    let mut pinned = device("1a:78:49:c6:0d:df", "192.168.1.20", "phone");
    pinned.is_randomized_mac = true;
    pinned.os = Some("Android".into());
    store.record_devices(&[keep.clone(), pinned.clone()], 3_000).unwrap();

    // …and the *earlier* offline row now reads the improved label, resolved
    // live against the roster rather than the stale snapshot.
    let offline = store
        .network_events(100)
        .unwrap()
        .into_iter()
        .find(|e| e.id == offline_id)
        .unwrap();
    assert_eq!(offline.name.as_deref(), Some("Android phone"));
    assert!(offline.is_randomized, "randomized resolves from the roster too");
}

#[test]
fn a_departed_device_keeps_its_snapshot_label() {
    let store = Store::open_in_memory().unwrap();
    let keep = device("aa:aa:aa:aa:aa:aa", "192.168.1.10", "computer");

    // A named laptop joins, then leaves the network for good (beyond any
    // future scan). Its offline row must keep the snapshot label, since the
    // roster row is the only place a live identity could come from.
    let mut laptop = device("bb:bb:bb:bb:bb:bb", "192.168.1.30", "computer");
    laptop.hostname = Some("laptop-01".into());
    store.record_devices(&[keep.clone(), laptop.clone()], 1_000).unwrap(); // baseline
    store.record_devices(std::slice::from_ref(&keep), 2_000).unwrap(); // laptop departs

    // Forget the departed device, simulating a roster it's no longer part of.
    store.lock().execute("DELETE FROM known_devices WHERE mac = ?1", ["bb:bb:bb:bb:bb:bb"]).unwrap();

    let offline = store
        .network_events(100)
        .unwrap()
        .into_iter()
        .find(|e| e.mac.as_deref() == Some("bb:bb:bb:bb:bb:bb"))
        .unwrap();
    assert_eq!(offline.event_type, "device_offline");
    assert_eq!(offline.name.as_deref(), Some("laptop-01"), "snapshot survives departure");
}

#[test]
fn a_connection_event_keeps_its_ssid_despite_a_matching_mac() {
    let store = Store::open_in_memory().unwrap();

    // The machine's own MAC is in the roster (it's scanned like any device),
    // so a wifi_connected event — which stores the SSID as its `name` and
    // happens to carry that same MAC — must NOT be relabeled to a device
    // name by the roster join.
    let mut selfd = device("aa:bb:cc:dd:ee:ff", "192.168.1.5", "computer");
    selfd.hostname = Some("my-macbook".into());
    selfd.is_self = true;
    store.record_devices(&[selfd.clone()], 500).unwrap();

    // Seed the connection baseline, then transition to a named Wi-Fi network.
    store
        .record_connection("wifi", Some("Home"), Some("wlan0"), Some("192.168.1.5"), Some("aa:bb:cc:dd:ee:ff"), 1_000)
        .unwrap();
    store
        .record_connection("ethernet", None, Some("eth0"), Some("192.168.1.5"), Some("aa:bb:cc:dd:ee:ff"), 1_500)
        .unwrap();
    store
        .record_connection("wifi", Some("Home"), Some("wlan0"), Some("192.168.1.5"), Some("aa:bb:cc:dd:ee:ff"), 2_000)
        .unwrap();

    let wifi = store
        .network_events(100)
        .unwrap()
        .into_iter()
        .find(|e| e.event_type == "wifi_connected")
        .unwrap();
    assert_eq!(wifi.name.as_deref(), Some("Home"), "the SSID must survive the roster join");
}
