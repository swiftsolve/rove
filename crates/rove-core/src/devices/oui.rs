//! MAC OUI to vendor lookup, backed by the IEEE registry.
//!
//! The table is the IEEE Registration Authority's public MA-L/MA-M/MA-S
//! registry, trimmed to `<bits>\t<hexprefix>\t<vendor>` rows and embedded at
//! compile time. `bits` is the assignment size (24, 28 or 36) and `hexprefix`
//! its `bits / 4` leading nibbles, uppercase. A 28- or 36-bit block sits inside
//! a 24-bit one, so a lookup tries the most specific size first.
//!
//! Regenerate with `cargo run -p rove-core --example gen_oui` (see that file for
//! the IEEE sources). Sourcing from IEEE rather than Wireshark's GPL-2.0 `manuf`
//! keeps the bundled table free of copyleft obligations.
use std::collections::HashMap;
use std::io::Read;
use std::sync::OnceLock;

/// Embedded gzipped (~555 KB vs ~1.8 MB raw) by `build.rs` from `data/oui.tsv`;
/// decompressed once, on first lookup, in [`table`].
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
        // Leaked so the maps can hold `&'static str` slices; the table lives for
        // the whole process anyway.
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

/// A MAC's registered vendor, most specific IEEE assignment first, shortened
/// by `clean_vendor` to a label a user would recognise ("Motorola", not
/// "Motorola (Wuhan) Mobility Technologies Communication Co., Ltd."). `None`
/// for unregistered or unparseable prefixes. A randomized MAC will almost never
/// match, but callers should still gate on [`is_randomized_mac`].
pub fn lookup_vendor(mac: &str) -> Option<String> {
    resolve(table(), mac).map(clean_vendor)
}

/// True when a MAC's registrant spans too many device kinds for its OUI to name
/// a type: the vendor is shown but casts no kind vote. TP-Link gets the same
/// treatment by being left out of the classifier's vendor table.
///
/// This covers registrants that can't be left out because they tidy to a brand
/// shared with unambiguous gear. "Motorola (Wuhan) Mobility Technologies
/// Communication Co., Ltd." is the ODM behind Lenovo's Google Assistant
/// smart-home line (Smart Clock, Smart Display, speakers), yet it tidies to the
/// same "Motorola" as the phone blocks. Left to vote, every Lenovo Smart Clock
/// would read as a phone.
pub fn is_kind_ambiguous_vendor(mac: &str) -> bool {
    resolve(table(), mac)
        .map(|v| {
            let v = v.to_ascii_lowercase();
            v.contains("motorola") && v.contains("wuhan")
        })
        .unwrap_or(false)
}

/// Consumer brands for OEM or parent legal names in the IEEE registry. They
/// surface a recognisable brand when the registered name is unrelated (Govee
/// registers as "Shenzhen Intellirocks Tech. Co. Ltd.") and fix casing tidying
/// can't (the registry shouts "TP-LINK"). Needles are lowercase substrings of the
/// IEEE name; keep them specific enough not to hit unrelated registrations.
const VENDOR_ALIASES: &[(&str, &str)] = &[
    // Govee's D41368, 5CE753, D4ADFC and E02A25 all register as the parent.
    ("intellirocks", "Govee"),
    // Brand casing tidying alone can't recover.
    ("tp-link", "TP-Link"),
    ("asustek", "ASUS"),
    ("hon hai", "Foxconn"),
];

/// Corporate and descriptor words that follow the brand in an IEEE legal name.
/// The brand is the words before the first of these, so "Samsung Electronics
/// Co.,Ltd" becomes "Samsung". Matched case-insensitively against each word
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

/// A curated alias when one matches, else the tidied name. Never empty.
fn clean_vendor(vendor: &str) -> String {
    if let Some(brand) = alias_vendor(vendor) {
        return brand.to_string();
    }
    tidy_vendor(vendor)
}

/// Substring match, which survives the registry's varying punctuation.
fn alias_vendor(vendor: &str) -> Option<&'static str> {
    let lower = vendor.to_ascii_lowercase();
    VENDOR_ALIASES
        .iter()
        .find(|(needle, _)| lower.contains(needle))
        .map(|(_, brand)| *brand)
}

/// Trim an IEEE legal name to the brand: drop asides like "(Wuhan)", then keep
/// the words before the first [`VENDOR_NOISE`] word. Casing is kept, as brands
/// are irregular (ASUS, iRobot). Falls back to the trimmed original if nothing
/// would be left.
fn tidy_vendor(vendor: &str) -> String {
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

    // Never cut at position 0: a few brands begin with a descriptor ("Digital
    // Devices", "General Electric").
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

/// The precedence logic, apart from the global table so tests can use a
/// synthetic one whatever the embedded snapshot contains.
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

/// The locally administered bit marks a privacy-randomized MAC.
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
        // 08:38:E6 is the Motorola (Wuhan) ODM block: Lenovo smart-home gear,
        // not a phone. It and the phone blocks both tidy to "Motorola", so the
        // flag is what keeps a lone Wuhan OUI from voting "phone".
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
        // 00:55:DA is an MA-L carved into MA-M blocks; a 28-bit match must win
        // over the 24-bit fallback.
        let mut t = OuiTable {
            b24: HashMap::new(),
            b28: HashMap::new(),
            b36: HashMap::new(),
        };
        t.b24.insert(0x0055DA, "Shared MA-L holder");
        t.b28.insert(0x0055DA1, "KoolPOS Inc.");
        // 0055DA1 has an MA-M entry, so the finer block wins.
        assert_eq!(resolve(&t, "00:55:da:1f:00:01"), Some("KoolPOS Inc."));
        // 0055DA0 has none, so the 24-bit holder answers.
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
        // 5C:E7:53 is a Govee block registered to the parent, Shenzhen
        // Intellirocks; the alias must surface "Govee".
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
        assert!(is_randomized_mac("a2:00:00:00:00:00")); // 0xA2 has bit 0x02 set
        assert!(!is_randomized_mac("b8:27:eb:00:00:00"));
    }
}
