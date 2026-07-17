//! On-device IP → identity lookups, backed by DB-IP's free Lite databases:
//! IP-to-Country (country of any address) and IP-to-ASN (autonomous-system
//! number + organization, i.e. the network operator).
//!
//! Resolved entirely on-device. The Hosts view geolocates every public peer an
//! app talks to, which is both far too many lookups for a free hosted API's
//! daily quota and — since the peer list is browsing-history-shaped — not data
//! worth handing to a third party to begin with. A bundled table has neither
//! problem, and keeps working offline. The ISP card leans on the same tables to
//! name our own network without depending on a live geolocation API that
//! rate-limits (see [`asn_info`] and [`country_name`]).
//!
//! Both databases are MMDB (MaxMind's format, which DB-IP publishes for reader
//! compatibility), embedded gzip'd and decoded once on first lookup. Unlike
//! `data/oui.tsv`, the sources are checked in already compressed: they're opaque
//! upstream binaries either way, so there's no greppable plaintext for the repo
//! to be the source of truth for, and no build-time compression step to run.
//!
//! Refresh with `cargo run -p rove-core --example gen_geoip` (DB-IP cuts new
//! releases monthly). The data is CC BY 4.0 — attribution lives in the README.
//! Chosen over MaxMind's GeoLite2, whose EULA requires destroying superseded
//! copies within 30 days of each twice-weekly release: a promise a shipped
//! binary can't keep.
use std::net::IpAddr;
use std::sync::OnceLock;

/// The databases as downloaded from DB-IP, each decoded once, on first lookup,
/// by the readers below.
static DBIP_COUNTRY_GZ: &[u8] = include_bytes!("../data/dbip-country-lite.mmdb.gz");
static DBIP_ASN_GZ: &[u8] = include_bytes!("../data/dbip-asn-lite.mmdb.gz");

/// Datacenter / hosting / VPN ASNs, one per line, sorted (see [`is_hosting_asn`]
/// and `examples/gen_hosting_asns.rs`). Small enough to embed as text and parse
/// once rather than ship another binary table.
static HOSTING_ASNS_TXT: &str = include_str!("../data/hosting-asns.txt");

/// Autonomous-system identity for an address: the network operator's number and
/// registered name. Either field may be absent even on a hit — the table names
/// most networks but not all.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AsnInfo {
    /// AS number, e.g. `15169`. The ISP card formats this as "AS15169".
    pub number: Option<u32>,
    /// The AS organization — usually the ISP, sometimes a parent or upstream.
    pub org: Option<String>,
}

/// Decode one embedded gzip'd MMDB blob into a reader, or `None` if it's
/// unreadable — which would be a build-time packaging fault, not a runtime
/// condition, so it's logged once here rather than at every lookup. `label` is
/// the file name, so the log names which table failed.
fn decode_mmdb(gz: &[u8], label: &str) -> Option<maxminddb::Reader<Vec<u8>>> {
    let mut raw = Vec::new();
    if let Err(e) = std::io::Read::read_to_end(&mut flate2::read::GzDecoder::new(gz), &mut raw) {
        tracing::error!("embedded {label} is not valid gzip: {e}");
        return None;
    }
    maxminddb::Reader::from_source(raw)
        .inspect_err(|e| tracing::error!("embedded {label} is unreadable: {e}"))
        .ok()
}

/// The parsed IP-to-Country database, decoded once on first use.
fn country_reader() -> Option<&'static maxminddb::Reader<Vec<u8>>> {
    static READER: OnceLock<Option<maxminddb::Reader<Vec<u8>>>> = OnceLock::new();
    READER
        .get_or_init(|| decode_mmdb(DBIP_COUNTRY_GZ, "dbip-country-lite.mmdb.gz"))
        .as_ref()
}

/// The parsed IP-to-ASN database, decoded once on first use.
fn asn_reader() -> Option<&'static maxminddb::Reader<Vec<u8>>> {
    static READER: OnceLock<Option<maxminddb::Reader<Vec<u8>>>> = OnceLock::new();
    READER
        .get_or_init(|| decode_mmdb(DBIP_ASN_GZ, "dbip-asn-lite.mmdb.gz"))
        .as_ref()
}

/// Resolve an IP to its ISO-3166 alpha-2 country code, uppercase.
///
/// `None` means the address has no country — unparseable, private/reserved, or
/// genuinely absent from the table (DB-IP's coverage is good but not total).
/// All three are stable answers for a given address, so callers are free to
/// cache a miss; there is no transient failure to retry, which is the point of
/// resolving locally.
pub fn country_code(ip: &str) -> Option<String> {
    let addr: IpAddr = ip.parse().ok()?;
    let code = country_reader()?
        .lookup(addr)
        .ok()?
        .decode::<maxminddb::geoip2::Country>()
        .ok()??
        .country
        .iso_code?;
    // The table is well-formed, but this crosses into the UI as a flag lookup —
    // hold the shape the callers assume rather than trusting the input blindly.
    (code.len() == 2 && code.bytes().all(|b| b.is_ascii_alphabetic()))
        .then(|| code.to_uppercase())
}

/// Resolve an IP to its English country name, e.g. "United States".
///
/// Falls back to the uppercase ISO code ([`country_code`]) on the rare hit that
/// carries a code but no English label, and is `None` for the same private/
/// reserved/absent addresses `country_code` rejects. This fills the ISP card's
/// Location row from local data when the live enrichment lookup is unavailable,
/// so it holds the full-name shape that lookup would have supplied rather than a
/// bare code.
pub fn country_name(ip: &str) -> Option<String> {
    let addr: IpAddr = ip.parse().ok()?;
    let english = country_reader()?
        .lookup(addr)
        .ok()?
        .decode::<maxminddb::geoip2::Country>()
        .ok()??
        .country
        .names
        .english
        .map(str::to_string);
    english.or_else(|| country_code(ip))
}

/// Resolve an IP to its autonomous-system identity — the operator's number and
/// name. `None` when the address is unparseable or the table has no entry for
/// it; a hit with both fields empty is possible but not useful, so callers get
/// `None` there too rather than an all-`None` [`AsnInfo`].
///
/// This is how the ISP card names our own network on-device: fed our public IP,
/// it yields the ASN and the operator name without a hosted lookup, so a
/// rate-limited or down geolocation API no longer blanks the card.
pub fn asn_info(ip: &str) -> Option<AsnInfo> {
    let addr: IpAddr = ip.parse().ok()?;
    let record = asn_reader()?
        .lookup(addr)
        .ok()?
        .decode::<maxminddb::geoip2::Asn>()
        .ok()??;
    let number = record.autonomous_system_number;
    let org = record
        .autonomous_system_organization
        .map(str::to_string)
        .filter(|s| !s.is_empty());
    (number.is_some() || org.is_some()).then_some(AsnInfo { number, org })
}

/// The embedded hosting-ASN list, parsed once into a sorted slice for binary
/// search. `#` comments and blank lines are skipped; the file is already sorted,
/// so this preserves that order (and would still be correct if it weren't — the
/// list is tiny, but membership below assumes sorted, so guard it here).
fn hosting_asns() -> &'static [u32] {
    static ASNS: OnceLock<Vec<u32>> = OnceLock::new();
    ASNS.get_or_init(|| {
        let mut v: Vec<u32> = HOSTING_ASNS_TXT
            .lines()
            .filter_map(|line| line.trim().parse::<u32>().ok())
            .collect();
        v.sort_unstable();
        v.dedup();
        v
    })
}

/// Whether `asn` belongs to a datacenter / hosting / VPN provider rather than a
/// consumer access network.
///
/// A residential IP is on an ISP's own AS; a hosting AS reaching the internet as
/// *someone's* egress almost always means a VPN or proxy. The ISP card feeds
/// this the ASN resolved for our public IP to decide whether to flag the card as
/// a VPN exit — which works even when the live enrichment lookup is unavailable,
/// since the ASN comes from the bundled table ([`asn_info`]).
pub fn is_hosting_asn(asn: u32) -> bool {
    hosting_asns().binary_search(&asn).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_well_known_public_addresses() {
        // Anchors picked to be stable allocations rather than merely current
        // routes: a registry would have to reassign the block to move them.
        assert_eq!(country_code("8.8.8.8").as_deref(), Some("US")); // Google
        assert_eq!(country_code("1.1.1.1").as_deref(), Some("AU")); // APNIC/Cloudflare
        assert_eq!(country_code("77.88.8.8").as_deref(), Some("RU")); // Yandex
    }

    #[test]
    fn resolves_ipv6() {
        // The table is a v6 tree with the v4 space mapped inside it, so v6 must
        // resolve through the same path.
        assert!(country_code("2606:4700:4700::1111").is_some());
    }

    #[test]
    fn private_and_reserved_addresses_have_no_country() {
        assert_eq!(country_code("192.168.1.1"), None);
        assert_eq!(country_code("10.0.0.1"), None);
        assert_eq!(country_code("127.0.0.1"), None);
        assert_eq!(country_code("::1"), None);
    }

    #[test]
    fn unparseable_input_returns_none_rather_than_panicking() {
        assert_eq!(country_code(""), None);
        assert_eq!(country_code("not-an-ip"), None);
        assert_eq!(country_code("999.999.999.999"), None);
        // A bare hostname reaching this path would be a caller bug, not a crash.
        assert_eq!(country_code("example.com"), None);
    }

    #[test]
    fn country_name_gives_the_full_english_label() {
        assert_eq!(country_name("8.8.8.8").as_deref(), Some("United States"));
        // Not a code: the ISP card's Location row shows this verbatim.
        assert_eq!(country_name("77.88.8.8").as_deref(), Some("Russia"));
    }

    #[test]
    fn country_name_has_no_answer_for_private_or_junk_addresses() {
        assert_eq!(country_name("192.168.1.1"), None);
        assert_eq!(country_name("not-an-ip"), None);
        assert_eq!(country_name(""), None);
    }

    #[test]
    fn asn_names_well_known_networks() {
        // Same stable-allocation anchors as the country tests. The org string is
        // upstream's and can be reworded between releases, so assert on the AS
        // number (which a reassignment would have to move) and only that the org
        // is present and mentions the operator.
        let google = asn_info("8.8.8.8").expect("8.8.8.8 has an ASN");
        assert_eq!(google.number, Some(15169));
        assert!(google.org.unwrap_or_default().to_lowercase().contains("google"));

        assert_eq!(asn_info("1.1.1.1").and_then(|a| a.number), Some(13335)); // Cloudflare
    }

    #[test]
    fn asn_resolves_ipv6() {
        assert!(asn_info("2606:4700:4700::1111").is_some());
    }

    #[test]
    fn asn_has_no_answer_for_private_or_junk_addresses() {
        assert_eq!(asn_info("192.168.1.1"), None);
        assert_eq!(asn_info("127.0.0.1"), None);
        assert_eq!(asn_info("::1"), None);
        assert_eq!(asn_info("not-an-ip"), None);
        assert_eq!(asn_info(""), None);
    }

    #[test]
    fn hosting_asns_flag_datacenters_not_consumer_isps() {
        // Datacenter/VPN networks: AWS, M247 (the host behind many commercial
        // VPNs), DigitalOcean, OVH — the exits a VPN'd user appears to come from.
        assert!(is_hosting_asn(16509)); // Amazon AWS
        assert!(is_hosting_asn(9009)); // M247
        assert!(is_hosting_asn(14061)); // DigitalOcean
        assert!(is_hosting_asn(16276)); // OVH
        // Consumer access ISPs must never be flagged — that's the false positive
        // that would wrongly relabel a real connection as a VPN.
        assert!(!is_hosting_asn(577)); // Bell Canada
        assert!(!is_hosting_asn(7922)); // Comcast
        assert!(!is_hosting_asn(0));
    }

    #[test]
    fn the_hosting_list_is_sorted_so_binary_search_holds() {
        // is_hosting_asn relies on this; a mis-sorted embed would silently miss.
        assert!(super::hosting_asns().windows(2).all(|w| w[0] < w[1]));
        assert!(super::hosting_asns().len() > 500);
    }
}
