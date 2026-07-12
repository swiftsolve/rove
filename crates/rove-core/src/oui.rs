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
use std::io::Read;
use std::sync::OnceLock;

/// The table is embedded gzip'd (~555 KB vs ~1.8 MB raw); `build.rs` compresses
/// `data/oui.tsv` into `OUT_DIR` at build time. Decompressed once, on first
/// lookup, in [`table`].
static OUI_GZ: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/oui.tsv.gz"));

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
        // Decompress the embedded table and leak it so the map values can borrow
        // `&'static str` slices — the table lives for the whole process anyway.
        let mut raw = String::new();
        flate2::read::GzDecoder::new(OUI_GZ)
            .read_to_string(&mut raw)
            .expect("embedded oui.tsv.gz is valid gzip");
        let data: &'static str = Box::leak(raw.into_boxed_str());

        let mut t = OuiTable {
            b24: HashMap::new(),
            b28: HashMap::new(),
            b36: HashMap::new(),
        };
        for line in data.lines() {
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
///
/// The registered name is passed through [`clean_vendor`] so the verbose IEEE
/// legal name ("Motorola (Wuhan) Mobility Technologies Communication Co., Ltd.")
/// becomes a short label a user would recognize ("Motorola").
pub fn lookup_vendor(mac: &str) -> Option<String> {
    resolve(table(), mac).map(clean_vendor)
}

/// True when a MAC's registrant spans so many device kinds that its OUI alone
/// can't name a type — the classifier should read the vendor for *display* but
/// cast no *kind* vote, letting a real mDNS/hostname/port signal decide (the same
/// stance [`crate::devices`] takes on TP-Link's catalog-wide block, dropped there
/// by omission from the vendor table).
///
/// This exists for the ambiguous registrants that *can't* be dropped by omission
/// because they tidy to a brand shared with unambiguous gear. "Motorola (Wuhan)
/// Mobility Technologies Communication Co., Ltd." is the ODM behind Lenovo's
/// Google-Assistant smart-home line — Smart Clock, Smart Display, Smart Tab,
/// speakers — not Motorola-brand phones, yet it tidies to the same "Motorola" as
/// the phone blocks ("Motorola Mobility LLC, a Lenovo Company"). Left to vote it
/// would confidently label every Lenovo Smart Clock a phone.
pub fn is_kind_ambiguous_vendor(mac: &str) -> bool {
    resolve(table(), mac)
        .map(|v| {
            let v = v.to_ascii_lowercase();
            v.contains("motorola") && v.contains("wuhan")
        })
        .unwrap_or(false)
}

/// Consumer-brand aliases for OEM/parent legal names as registered with the IEEE.
/// Two jobs: surface a recognizable brand when the registry name is unrelated
/// (Govee registers as "Shenzhen Intellirocks Tech. Co. Ltd."), and fix the
/// casing that generic tidying can't (the registry shouts "TP-LINK", the brand
/// is "TP-Link"). Each entry maps a distinctive, already-lowercased substring of
/// the IEEE name to the brand. Curated and license-clean, like the table itself;
/// keep needles specific enough not to collide with unrelated registrations.
const VENDOR_ALIASES: &[(&str, &str)] = &[
    // Govee (D41368/5CE753/D4ADFC/E02A25 all register as the parent company).
    ("intellirocks", "Govee"),
    // All-caps / OEM legal names whose brand casing tidying alone can't recover.
    ("tp-link", "TP-Link"),
    ("asustek", "ASUS"),
    ("hon hai", "Foxconn"),
];

/// Corporate/descriptor words that follow the brand in an IEEE legal name. The
/// brand is the run of words *before* the first of these, so cutting here turns
/// "Samsung Electronics Co.,Ltd" into "Samsung" and "TP-LINK TECHNOLOGIES
/// CO.,LTD." into "TP-LINK". Compared case-insensitively against each word
/// stripped of surrounding punctuation.
const VENDOR_NOISE: &[&str] = &[
    "technologies", "technology", "mobility", "communication", "communications",
    "systems", "system", "electronics", "electronic", "networks", "network",
    "corporation", "corp", "company", "co", "ltd", "inc", "gmbh", "llc",
    "international", "holdings", "group", "industries", "industry", "manufacturing",
    "semiconductor", "semiconductors", "devices", "device", "solutions",
    "information", "computer", "computers", "enterprise", "enterprises", "limited",
    "incorporated", "plc", "electric", "lighting",
    // Non-English legal-entity suffixes, treated like "Inc"/"Ltd" ("Philips
    // Lighting BV" -> "Philips", "Foo Oy" -> "Foo").
    "bv", "ag", "sa", "oy", "ab", "pty", "pte", "kk", "sarl", "spa",
];

/// Map a raw IEEE vendor string to a short, recognizable label: a curated alias
/// when one matches, else the generically tidied name (suffixes and location
/// asides dropped). Never returns empty.
fn clean_vendor(vendor: &str) -> String {
    if let Some(brand) = alias_vendor(vendor) {
        return brand.to_string();
    }
    tidy_vendor(vendor)
}

/// Curated-alias lookup: case-insensitive substring match on a distinctive stem
/// ("intellirocks", "tp-link"), which is stable across registry punctuation.
fn alias_vendor(vendor: &str) -> Option<&'static str> {
    let lower = vendor.to_ascii_lowercase();
    VENDOR_ALIASES
        .iter()
        .find(|(needle, _)| lower.contains(needle))
        .map(|(_, brand)| *brand)
}

/// Trim an IEEE legal name down to the brand: drop parenthetical asides like
/// "(Wuhan)", then keep the words before the first corporate/descriptor word
/// (see [`VENDOR_NOISE`]). Casing is preserved — brand names are irregular
/// (ASUS, iRobot), so title-casing would do more harm than good. Falls back to
/// the trimmed original if the heuristic would leave nothing.
fn tidy_vendor(vendor: &str) -> String {
    // Drop bracketed asides (locations, notes) that split a brand from its type.
    let mut without_brackets = String::with_capacity(vendor.len());
    let mut depth: u32 = 0;
    for c in vendor.chars() {
        match c {
            '(' | '[' => depth += 1,
            ')' | ']' => depth = depth.saturating_sub(1),
            _ if depth == 0 => without_brackets.push(c),
            _ => {}
        }
    }

    let words: Vec<&str> = without_brackets
        .split(|c: char| c.is_whitespace() || c == ',')
        .filter(|w| !w.is_empty())
        .collect();

    // Cut at the first noise word — but never at position 0, since a few brands
    // legitimately begin with a descriptor ("Digital Devices", "General Electric").
    let mut end = words.len();
    for (i, word) in words.iter().enumerate().skip(1) {
        let key = word.trim_matches(|c: char| !c.is_ascii_alphanumeric()).to_ascii_lowercase();
        if VENDOR_NOISE.contains(&key.as_str()) {
            end = i;
            break;
        }
    }

    let cleaned = words[..end]
        .join(" ")
        .trim_matches(|c: char| c == ',' || c == '.' || c.is_whitespace())
        .to_string();

    if cleaned.is_empty() {
        vendor.trim().to_string()
    } else {
        cleaned
    }
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
    fn motorola_wuhan_odm_is_flagged_kind_ambiguous_but_motorola_phones_are_not() {
        // 08:38:E6 is the "Motorola (Wuhan) Mobility Technologies Communication"
        // ODM block — Lenovo smart-home gear (Smart Clock/Display/Tab, speakers),
        // not a phone. Both it and the phone blocks tidy to a bare "Motorola", so
        // the flag is what keeps a lone Wuhan OUI from voting "phone".
        assert_eq!(lookup_vendor("08:38:E6:D8:DF:23").as_deref(), Some("Motorola"));
        assert!(is_kind_ambiguous_vendor("08:38:E6:D8:DF:23"));
        assert!(is_kind_ambiguous_vendor("04:34:F6:00:00:01"));

        // The Motorola-brand phone blocks ("Motorola Mobility LLC, a Lenovo
        // Company") also tidy to "Motorola" but stay a confident phone vote.
        assert_eq!(lookup_vendor("00:62:01:00:00:01").as_deref(), Some("Motorola"));
        assert!(!is_kind_ambiguous_vendor("00:62:01:00:00:01"));
        assert!(!is_kind_ambiguous_vendor("04:D3:95:00:00:01"));

        // An unrelated vendor and an unregistered prefix are never flagged.
        assert!(!is_kind_ambiguous_vendor("b8:27:eb:11:22:33"));
        assert!(!is_kind_ambiguous_vendor("02:00:00:00:00:00"));
    }

    #[test]
    fn tidy_strips_location_asides_and_corporate_suffixes() {
        // The reported case: a verbose legal name collapses to the brand.
        assert_eq!(
            tidy_vendor("Motorola (Wuhan) Mobility Technologies Communication Co., Ltd."),
            "Motorola"
        );
        assert_eq!(tidy_vendor("Samsung Electronics Co.,Ltd"), "Samsung");
        assert_eq!(tidy_vendor("Cisco Systems, Inc"), "Cisco");
        assert_eq!(tidy_vendor("Espressif Inc."), "Espressif");
    }

    #[test]
    fn tidy_keeps_a_brand_that_begins_with_a_descriptor_word() {
        // "Devices" is a noise word, but cutting at position 0 would leave nothing,
        // so a leading descriptor is preserved.
        assert_eq!(tidy_vendor("Digital Devices GmbH"), "Digital");
    }

    #[test]
    fn tidy_leaves_a_clean_short_name_untouched() {
        assert_eq!(tidy_vendor("Sonos, Inc."), "Sonos");
        assert_eq!(tidy_vendor("Nintendo Co.,Ltd"), "Nintendo");
    }

    #[test]
    fn tidy_strips_descriptor_and_non_english_legal_forms() {
        // The reported case, plus other legal-entity suffixes.
        assert_eq!(tidy_vendor("Philips Lighting BV"), "Philips");
        assert_eq!(tidy_vendor("Wibrain Oy"), "Wibrain");
        assert_eq!(tidy_vendor("Sagemcom SA"), "Sagemcom");
    }

    #[test]
    fn tidy_keeps_multiword_brands_whose_second_word_is_not_noise() {
        // Regression: an over-broad noise list would clip these to one word.
        assert_eq!(tidy_vendor("Western Digital Technologies, Inc."), "Western Digital");
        assert_eq!(tidy_vendor("Texas Instruments"), "Texas Instruments");
    }

    #[test]
    fn alias_fixes_mangled_brand_casing() {
        assert_eq!(clean_vendor("TP-LINK TECHNOLOGIES CO.,LTD."), "TP-Link");
        assert_eq!(clean_vendor("ASUSTek COMPUTER INC."), "ASUS");
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
    fn aliases_oem_legal_name_to_consumer_brand() {
        // 5C:E7:53 is one of Govee's blocks, registered to the parent
        // "Shenzhen Intellirocks Tech. Co. Ltd." — the alias must surface "Govee".
        assert_eq!(lookup_vendor("5c:e7:53:3d:59:80").as_deref(), Some("Govee"));
    }

    #[test]
    fn alias_leaves_unmapped_vendors_untouched() {
        // Raspberry Pi has no alias, so the registry name passes through.
        assert!(lookup_vendor("b8:27:eb:11:22:33")
            .unwrap()
            .to_lowercase()
            .contains("raspberry"));
    }

    #[test]
    fn detects_randomized_mac() {
        assert!(is_randomized_mac("a2:00:00:00:00:00")); // 0xA2 & 0x02 == set
        assert!(!is_randomized_mac("b8:27:eb:00:00:00"));
    }
}
