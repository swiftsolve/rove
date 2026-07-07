//! MAC OUI → vendor lookup, backed by the IEEE registry.
//!
//! The table is compiled from the IEEE Registration Authority's public
//! MA-L/MA-M/MA-S assignment registry, trimmed to `<bits>\t<hexprefix>\t<vendor>`
//! rows and embedded at compile time. `bits` is the assignment size (24, 28, or
//! 36) and `hexprefix` is the significant leading nibbles (`bits / 4` of them),
//! uppercase. IEEE hands out blocks at three granularities, so a lookup tries
//! the most specific first.
//!
//! Regenerate with `cargo run -p rove-core --example gen_oui` (see that file for
//! the IEEE sources). Sourcing from IEEE rather than Wireshark's GPL-2.0 `manuf`
//! keeps the bundled table free of copyleft obligations.
use std::collections::HashMap;
use std::sync::OnceLock;

static OUI_DATA: &str = include_str!("../data/oui.tsv");

struct OuiTable {
    /// 24-bit assignments (MA-L), keyed by the first 6 nibbles.
    b24: HashMap<u32, &'static str>,
    /// 28-bit assignments (MA-M), keyed by the first 7 nibbles.
    b28: HashMap<u32, &'static str>,
    /// 36-bit assignments (MA-S), keyed by the first 9 nibbles.
    b36: HashMap<u64, &'static str>,
}

fn table() -> &'static OuiTable {
    static TABLE: OnceLock<OuiTable> = OnceLock::new();
    TABLE.get_or_init(|| {
        let mut t = OuiTable {
            b24: HashMap::new(),
            b28: HashMap::new(),
            b36: HashMap::new(),
        };
        for line in OUI_DATA.lines() {
            let mut fields = line.splitn(3, '\t');
            let (Some(bits), Some(prefix), Some(vendor)) =
                (fields.next(), fields.next(), fields.next())
            else {
                continue;
            };
            match bits {
                "24" => {
                    if let Ok(key) = u32::from_str_radix(prefix, 16) {
                        t.b24.insert(key, vendor);
                    }
                }
                "28" => {
                    if let Ok(key) = u32::from_str_radix(prefix, 16) {
                        t.b28.insert(key, vendor);
                    }
                }
                "36" => {
                    if let Ok(key) = u64::from_str_radix(prefix, 16) {
                        t.b36.insert(key, vendor);
                    }
                }
                _ => {}
            }
        }
        t
    })
}

/// Resolve a MAC to its registered vendor, preferring the most specific IEEE
/// assignment (36-bit, then 28-bit, then the 24-bit OUI). Returns `None` for
/// unregistered or unparseable prefixes — a randomized MAC will almost never
/// match, but callers should still gate on [`is_randomized_mac`].
pub fn lookup_vendor(mac: &str) -> Option<&'static str> {
    resolve(table(), mac)
}

/// The precedence logic, split out from the global table so it can be unit
/// tested against a synthetic table regardless of which assignments the
/// embedded snapshot happens to contain.
fn resolve(t: &OuiTable, mac: &str) -> Option<&'static str> {
    let hex: String = mac
        .chars()
        .filter(|c| c.is_ascii_hexdigit())
        .take(9)
        .collect::<String>()
        .to_uppercase();
    if hex.len() < 6 {
        return None;
    }
    if hex.len() >= 9 {
        if let Ok(key) = u64::from_str_radix(&hex[..9], 16) {
            if let Some(vendor) = t.b36.get(&key) {
                return Some(vendor);
            }
        }
    }
    if hex.len() >= 7 {
        if let Ok(key) = u32::from_str_radix(&hex[..7], 16) {
            if let Some(vendor) = t.b28.get(&key) {
                return Some(vendor);
            }
        }
    }
    let key = u32::from_str_radix(&hex[..6], 16).ok()?;
    t.b24.get(&key).copied()
}

/// Locally-administered bit set → privacy-randomized MAC.
pub fn is_randomized_mac(mac: &str) -> bool {
    let hex: String = mac.chars().filter(|c| c.is_ascii_hexdigit()).take(2).collect();
    u8::from_str_radix(&hex, 16).map(|b| b & 0x02 != 0).unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_a_common_24_bit_oui() {
        // B8:27:EB is the Raspberry Pi Foundation MA-L block.
        assert!(lookup_vendor("b8:27:eb:11:22:33")
            .unwrap()
            .to_lowercase()
            .contains("raspberry"));
    }

    #[test]
    fn prefers_more_specific_assignments() {
        // 00:55:DA is a shared MA-L carved into /28 MA-M blocks; a 28-bit match
        // must win over the 24-bit fallback. Built as a synthetic table so the
        // guarantee holds regardless of which blocks the shipped snapshot has.
        let mut t = OuiTable {
            b24: HashMap::new(),
            b28: HashMap::new(),
            b36: HashMap::new(),
        };
        t.b24.insert(0x0055DA, "Shared MA-L holder");
        t.b28.insert(0x0055DA1, "KoolPOS Inc.");
        // 0055DA1.. has an MA-M entry → the finer block wins.
        assert_eq!(resolve(&t, "00:55:da:1f:00:01"), Some("KoolPOS Inc."));
        // 0055DA0.. has no MA-M entry → falls back to the 24-bit holder.
        assert_eq!(resolve(&t, "00:55:da:0f:00:01"), Some("Shared MA-L holder"));
    }

    #[test]
    fn unregistered_prefix_returns_none() {
        assert_eq!(lookup_vendor("02:00:00:00:00:00"), None);
    }

    #[test]
    fn tolerates_dashes_and_short_input() {
        assert!(lookup_vendor("B8-27-EB-00-00-00").is_some());
        assert_eq!(lookup_vendor("b8:27"), None); // too few nibbles
    }

    #[test]
    fn detects_randomized_mac() {
        assert!(is_randomized_mac("a2:00:00:00:00:00")); // 0xA2 & 0x02 == set
        assert!(!is_randomized_mac("b8:27:eb:00:00:00"));
    }
}
