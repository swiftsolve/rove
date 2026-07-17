//! IP → country lookup, backed by the DB-IP IP-to-Country Lite database.
//!
//! Resolved entirely on-device. The Hosts view geolocates every public peer an
//! app talks to, which is both far too many lookups for a free hosted API's
//! daily quota and — since the peer list is browsing-history-shaped — not data
//! worth handing to a third party to begin with. A bundled table has neither
//! problem, and keeps working offline.
//!
//! The database is MMDB (MaxMind's format, which DB-IP publishes for reader
//! compatibility), embedded gzip'd (~3.9 MB vs ~7.8 MB raw) and decoded once on
//! first lookup. Unlike `data/oui.tsv`, the source is checked in already
//! compressed: it's an opaque upstream binary either way, so there's no
//! greppable plaintext for the repo to be the source of truth for, and no
//! build-time compression step to run.
//!
//! Refresh with `cargo run -p rove-core --example gen_geoip` (DB-IP cuts a new
//! release monthly). The data is CC BY 4.0 — attribution lives in the README.
//! Chosen over MaxMind's GeoLite2, whose EULA requires destroying superseded
//! copies within 30 days of each twice-weekly release: a promise a shipped
//! binary can't keep.
use std::net::IpAddr;
use std::sync::OnceLock;

/// The database as downloaded from DB-IP, decoded once, on first lookup, in
/// [`reader`].
static DBIP_GZ: &[u8] = include_bytes!("../data/dbip-country-lite.mmdb.gz");

/// The parsed database, or `None` if the embedded blob is unreadable — which
/// would be a build-time packaging fault, not a runtime condition, so it's
/// logged once here rather than at every lookup.
fn reader() -> Option<&'static maxminddb::Reader<Vec<u8>>> {
    static READER: OnceLock<Option<maxminddb::Reader<Vec<u8>>>> = OnceLock::new();
    READER
        .get_or_init(|| {
            let mut raw = Vec::new();
            if let Err(e) = std::io::Read::read_to_end(
                &mut flate2::read::GzDecoder::new(DBIP_GZ),
                &mut raw,
            ) {
                tracing::error!("embedded dbip-country-lite.mmdb.gz is not valid gzip: {e}");
                return None;
            }
            maxminddb::Reader::from_source(raw)
                .inspect_err(|e| tracing::error!("embedded IP-to-country database is unreadable: {e}"))
                .ok()
        })
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
    let code = reader()?
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
}
