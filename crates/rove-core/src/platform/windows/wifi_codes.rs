//! The Native Wi-Fi API's codes in the words the other platforms use:
//! "802.11ax" for a PHY type, "WPA3-Personal" for an auth algorithm, and the
//! passphrase from a saved profile's XML.

/// `DOT11_PHY_TYPE` values, the 802.11 amendment a link runs.
const PHY_DSSS: i32 = 2;
const PHY_OFDM: i32 = 4;
const PHY_HRDSSS: i32 = 5;
const PHY_ERP: i32 = 6;
const PHY_HT: i32 = 7;
const PHY_VHT: i32 = 8;
const PHY_DMG: i32 = 9;
const PHY_HE: i32 = 10;
const PHY_EHT: i32 = 11;

/// The 802.11 amendment for a `DOT11_PHY_TYPE`, as the other platforms
/// report it ("802.11ax"), which the frontend labels "Wi-Fi 6".
pub(super) fn wifi_standard(phy_type: i32) -> Option<&'static str> {
    match phy_type {
        PHY_DSSS => Some("802.11"),
        PHY_OFDM => Some("802.11a"),
        PHY_HRDSSS => Some("802.11b"),
        PHY_ERP => Some("802.11g"),
        PHY_HT => Some("802.11n"),
        PHY_VHT => Some("802.11ac"),
        PHY_DMG => Some("802.11ad"),
        PHY_HE => Some("802.11ax"),
        PHY_EHT => Some("802.11be"),
        _ => None,
    }
}

/// The generation whose beacon elements give the link's channel width.
/// `None` for an unknown PHY, or 60 GHz 802.11ad, which has no such elements.
pub(super) fn phy_generation(phy_type: i32) -> Option<super::beacon::Generation> {
    match phy_type {
        PHY_DSSS | PHY_OFDM | PHY_HRDSSS | PHY_ERP => Some(super::beacon::Generation::Legacy),
        PHY_HT => Some(super::beacon::Generation::HighThroughput),
        PHY_VHT => Some(super::beacon::Generation::VeryHighThroughput),
        PHY_HE => Some(super::beacon::Generation::HighEfficiency),
        PHY_EHT => Some(super::beacon::Generation::ExtremelyHighThroughput),
        _ => None,
    }
}

/// The security label for a `DOT11_AUTH_ALGORITHM`, in the words the other
/// platforms use, which the frontend reads the protocol from.
pub(super) fn security_label(is_security_enabled: bool, auth_algorithm: i32) -> String {
    let label = match auth_algorithm {
        // Open authentication with encryption on is WEP.
        1 if is_security_enabled => "WEP",
        1 => "Open",
        2 => "WEP",
        3 => "WPA-Enterprise",
        4 => "WPA-Personal",
        6 => "WPA2-Enterprise",
        7 => "WPA2-Personal",
        8 => "WPA3-Enterprise 192-bit",
        9 => "WPA3-Personal",
        10 => "OWE",
        11 => "WPA3-Enterprise",
        _ if is_security_enabled => "Secured",
        _ => "Open",
    };
    label.to_string()
}

/// The key in a profile's XML, when it's in plain text. An encrypted key
/// (`<protected>true</protected>`) is no use, so `None`.
pub(super) fn plain_text_key(profile_xml: &str) -> Option<String> {
    if profile_xml.contains("<protected>true</protected>") {
        return None;
    }
    let after_tag = profile_xml.split_once("<keyMaterial>")?.1;
    let key = after_tag.split_once("</keyMaterial>")?.0;
    let key = unescape_xml(key);
    (!key.is_empty()).then_some(key)
}

/// Undo XML's five escapes, `&amp;` last so `&amp;lt;` stays `&lt;`.
fn unescape_xml(text: &str) -> String {
    text.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'").replace("&amp;", "&")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn phy_types_read_as_the_802_11_amendment() {
        assert_eq!(wifi_standard(PHY_HE), Some("802.11ax"));
        assert_eq!(wifi_standard(PHY_EHT), Some("802.11be"));
        assert_eq!(wifi_standard(PHY_HT), Some("802.11n"));
        assert_eq!(wifi_standard(0), None);
    }

    #[test]
    fn phy_types_pick_the_generation_whose_elements_give_the_width() {
        use super::super::beacon::Generation;
        assert_eq!(phy_generation(PHY_ERP), Some(Generation::Legacy));
        assert_eq!(phy_generation(PHY_VHT), Some(Generation::VeryHighThroughput));
        assert_eq!(phy_generation(PHY_EHT), Some(Generation::ExtremelyHighThroughput));
        // 60 GHz 802.11ad has none of those elements.
        assert_eq!(phy_generation(PHY_DMG), None);
    }

    #[test]
    fn auth_algorithms_read_as_the_protocol() {
        assert_eq!(security_label(true, 9), "WPA3-Personal");
        assert_eq!(security_label(true, 7), "WPA2-Personal");
        assert_eq!(security_label(false, 1), "Open");
        assert_eq!(security_label(true, 1), "WEP");
        assert_eq!(security_label(true, 10), "OWE");
    }

    #[test]
    fn a_plain_text_key_is_read_and_unescaped() {
        let xml = "<sharedKey><keyType>passPhrase</keyType><protected>false</protected>\
            <keyMaterial>fish &amp; chips &lt;3</keyMaterial></sharedKey>";
        assert_eq!(plain_text_key(xml).as_deref(), Some("fish & chips <3"));
    }

    #[test]
    fn an_encrypted_or_missing_key_gives_none() {
        let encrypted = "<protected>true</protected><keyMaterial>01000000D08C9DDF</keyMaterial>";
        assert_eq!(plain_text_key(encrypted), None);
        assert_eq!(plain_text_key("<authentication>open</authentication>"), None);
    }
}
