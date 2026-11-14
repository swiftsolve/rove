//! The channel width an access point advertises, read from the information
//! elements in its beacon. Windows reports the channel but not its width, so
//! the width comes from these, the same elements `iw` decodes on Linux.
//!
//! This is the width the access point runs, not the one the link agreed on: an
//! 80 MHz-only adapter on a 160 MHz access point reads 160. The link's 802.11
//! generation narrows it where it can, since an 802.11n link can't use the
//! 80 MHz a Wi-Fi 6 access point advertises.
//!
//! Pure code over bytes, so the tests run on every platform.

/// The 802.11 generation a link runs, which decides the elements that set its width.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Generation {
    /// 802.11a/b/g: always 20 MHz.
    Legacy,
    /// 802.11n, Wi-Fi 4: 20 or 40 MHz.
    HighThroughput,
    /// 802.11ac, Wi-Fi 5: up to 160 MHz.
    VeryHighThroughput,
    /// 802.11ax, Wi-Fi 6 and 6E: up to 160 MHz.
    HighEfficiency,
    /// 802.11be, Wi-Fi 7: up to 320 MHz.
    ExtremelyHighThroughput,
}

const HT_OPERATION: u8 = 61;
const VHT_OPERATION: u8 = 192;
/// The element whose first byte names the real element, for IDs past 255.
const EXTENSION: u8 = 255;
const HE_OPERATION: u8 = 36;
const EHT_OPERATION: u8 = 106;

/// The channel width in MHz for a link of `generation`, from the beacon's
/// information elements. `None` when the elements that would say are missing.
pub(crate) fn channel_width_mhz(information_elements: &[u8], generation: Generation) -> Option<i64> {
    let elements = Elements::parse(information_elements);
    let ht_width = elements.ht_operation.and_then(ht_operation_width);
    let vht_width = elements.vht_operation.and_then(vht_operation_width);
    let he_width = elements.he_operation.and_then(he_operation_width);
    let eht_width = elements.eht_operation.and_then(eht_operation_width);

    // Each generation's own element first, then the older ones it builds on:
    // a Wi-Fi 6 access point on 5 GHz states its width in the VHT element.
    match generation {
        Generation::Legacy => Some(20),
        Generation::HighThroughput => ht_width,
        Generation::VeryHighThroughput => vht_width.or(ht_width),
        Generation::HighEfficiency => he_width.or(vht_width).or(ht_width),
        Generation::ExtremelyHighThroughput => eht_width.or(he_width).or(vht_width).or(ht_width),
    }
}

/// The bodies of the four elements that carry a width, those present.
#[derive(Default)]
struct Elements<'a> {
    ht_operation: Option<&'a [u8]>,
    vht_operation: Option<&'a [u8]>,
    /// Starting after the extension ID byte.
    he_operation: Option<&'a [u8]>,
    /// Starting after the extension ID byte.
    eht_operation: Option<&'a [u8]>,
}

impl<'a> Elements<'a> {
    /// Walk the elements, each an ID byte, a length byte and that many bytes.
    /// A truncated last element ends the walk.
    fn parse(bytes: &'a [u8]) -> Self {
        let mut elements = Elements::default();
        let mut rest = bytes;
        while let [id, length, after_header @ ..] = rest {
            let length = usize::from(*length);
            if after_header.len() < length {
                break;
            }
            let (body, next) = after_header.split_at(length);
            match (*id, body) {
                (HT_OPERATION, _) => elements.ht_operation = Some(body),
                (VHT_OPERATION, _) => elements.vht_operation = Some(body),
                (EXTENSION, [HE_OPERATION, extension_body @ ..]) => elements.he_operation = Some(extension_body),
                (EXTENSION, [EHT_OPERATION, extension_body @ ..]) => elements.eht_operation = Some(extension_body),
                _ => {}
            }
            rest = next;
        }
        elements
    }
}

/// HT Operation: 40 MHz when a secondary channel is set and any width is
/// allowed, otherwise 20.
fn ht_operation_width(body: &[u8]) -> Option<i64> {
    let information = *body.get(1)?;
    let has_secondary_channel = information & 0b011 != 0;
    let allows_any_width = information & 0b100 != 0;
    Some(if has_secondary_channel && allows_any_width { 40 } else { 20 })
}

/// VHT Operation: 80 MHz or wider. `None` for "20 or 40", which the HT
/// element settles.
fn vht_operation_width(body: &[u8]) -> Option<i64> {
    let [width_code, centre_segment_0, centre_segment_1, ..] = *body else {
        return None;
    };
    match width_code {
        // 80 MHz, unless a second centre segment is set. One 8 channels away is
        // the centre of a 160 MHz channel; further away, an 80+80 pair, which
        // also spans 160 MHz of spectrum.
        1 if centre_segment_1 == 0 => Some(80),
        1 if centre_segment_1.abs_diff(centre_segment_0) >= 8 => Some(160),
        1 => Some(80),
        // The older ways of saying 160 and 80+80.
        2 | 3 => Some(160),
        _ => None,
    }
}

/// HE Operation: the width only for 6 GHz, where it's in the 6 GHz Operation
/// Information. On 2.4 and 5 GHz the HT and VHT elements carry it.
fn he_operation_width(body: &[u8]) -> Option<i64> {
    let [parameters_0, parameters_1, parameters_2, ..] = *body else {
        return None;
    };
    let parameters = u32::from_le_bytes([parameters_0, parameters_1, parameters_2, 0]);
    let has_vht_information = parameters & (1 << 14) != 0;
    let has_co_hosted_bss = parameters & (1 << 15) != 0;
    let has_6ghz_information = parameters & (1 << 17) != 0;
    if !has_6ghz_information {
        return None;
    }
    // Parameters (3 bytes), BSS colour (1) and basic MCS set (2) come first,
    // then each optional field that's present.
    let mut offset = 6;
    if has_vht_information {
        offset += 3;
    }
    if has_co_hosted_bss {
        offset += 1;
    }
    // The 6 GHz block: primary channel, then the control byte.
    let control = *body.get(offset + 1)?;
    match control & 0b11 {
        0 => Some(20),
        1 => Some(40),
        2 => Some(80),
        _ => Some(160),
    }
}

/// EHT Operation: the width from its Operation Information, when present.
fn eht_operation_width(body: &[u8]) -> Option<i64> {
    let parameters = *body.first()?;
    let has_operation_information = parameters & 1 != 0;
    if !has_operation_information {
        return None;
    }
    // Parameters (1 byte) and the basic MCS set (4) come before the control byte.
    let control = *body.get(5)?;
    match control & 0b111 {
        0 => Some(20),
        1 => Some(40),
        2 => Some(80),
        3 => Some(160),
        4 => Some(320),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// An HT Operation element: primary channel, then the information byte.
    fn ht_operation(information: u8) -> Vec<u8> {
        let mut element = vec![HT_OPERATION, 22, 36, information];
        element.resize(2 + 22, 0);
        element
    }

    fn vht_operation(width_code: u8, centre_segment_0: u8, centre_segment_1: u8) -> Vec<u8> {
        vec![VHT_OPERATION, 5, width_code, centre_segment_0, centre_segment_1, 0xfc, 0xff]
    }

    /// An HE Operation element with a 6 GHz block whose control byte is `control`.
    fn he_operation_6ghz(control: u8) -> Vec<u8> {
        // Bit 17 set: the 6 GHz block is present.
        let parameters = (1u32 << 17).to_le_bytes();
        let body = [
            HE_OPERATION,
            parameters[0],
            parameters[1],
            parameters[2],
            0x01, // BSS colour
            0xfc,
            0xff, // basic MCS set
            101,  // primary channel
            control,
            103,  // centre segment 0
            111,  // centre segment 1
            0x01, // minimum rate
        ];
        let mut element = vec![EXTENSION, u8::try_from(body.len()).expect("a test element fits a length byte")];
        element.extend_from_slice(&body);
        element
    }

    fn eht_operation(control: u8) -> Vec<u8> {
        let body = [EHT_OPERATION, 0x01, 0x44, 0x44, 0x44, 0x44, control, 31, 63];
        let mut element = vec![EXTENSION, u8::try_from(body.len()).expect("a test element fits a length byte")];
        element.extend_from_slice(&body);
        element
    }

    /// The SSID element every beacon starts with, which the walk skips over.
    fn ssid() -> Vec<u8> {
        let mut element = vec![0, 7];
        element.extend_from_slice(b"Bangla5");
        element
    }

    #[test]
    fn a_wifi_4_link_reads_the_ht_element() {
        // Secondary channel above (1), any width allowed (0b100).
        let ies = [ssid(), ht_operation(0b101)].concat();
        assert_eq!(channel_width_mhz(&ies, Generation::HighThroughput), Some(40));
        // No secondary channel: 20 MHz.
        let ies = [ssid(), ht_operation(0b100)].concat();
        assert_eq!(channel_width_mhz(&ies, Generation::HighThroughput), Some(20));
    }

    #[test]
    fn a_wifi_5_link_reads_80_and_160_from_the_vht_element() {
        let ht = ht_operation(0b101);
        assert_eq!(
            channel_width_mhz(&[ht.clone(), vht_operation(1, 42, 0)].concat(), Generation::VeryHighThroughput),
            Some(80)
        );
        // Channel 36-64 as 160 MHz: segment 0 at 42, segment 1 at 50.
        assert_eq!(
            channel_width_mhz(&[ht.clone(), vht_operation(1, 42, 50)].concat(), Generation::VeryHighThroughput),
            Some(160)
        );
        // 80+80: two segments far apart.
        assert_eq!(
            channel_width_mhz(&[ht.clone(), vht_operation(1, 42, 155)].concat(), Generation::VeryHighThroughput),
            Some(160)
        );
        // Width code 0 leaves it to the HT element.
        assert_eq!(
            channel_width_mhz(&[ht, vht_operation(0, 36, 0)].concat(), Generation::VeryHighThroughput),
            Some(40)
        );
    }

    #[test]
    fn an_older_link_ignores_the_wider_elements_it_cant_use() {
        let ies = [ht_operation(0b101), vht_operation(1, 42, 50), eht_operation(4)].concat();
        assert_eq!(channel_width_mhz(&ies, Generation::HighThroughput), Some(40));
        assert_eq!(channel_width_mhz(&ies, Generation::Legacy), Some(20));
    }

    #[test]
    fn a_wifi_6e_link_reads_the_6ghz_block() {
        assert_eq!(channel_width_mhz(&he_operation_6ghz(3), Generation::HighEfficiency), Some(160));
        assert_eq!(channel_width_mhz(&he_operation_6ghz(2), Generation::HighEfficiency), Some(80));
    }

    #[test]
    fn a_wifi_6_link_on_5ghz_falls_back_to_the_vht_element() {
        // An HE element with no 6 GHz block: parameters all zero.
        let he_without_6ghz = vec![EXTENSION, 7, HE_OPERATION, 0, 0, 0, 0x01, 0xfc, 0xff];
        let ies = [ht_operation(0b101), vht_operation(1, 42, 0), he_without_6ghz].concat();
        assert_eq!(channel_width_mhz(&ies, Generation::HighEfficiency), Some(80));
    }

    #[test]
    fn a_wifi_7_link_reads_320_from_the_eht_element() {
        let ies = [he_operation_6ghz(3), eht_operation(4)].concat();
        assert_eq!(channel_width_mhz(&ies, Generation::ExtremelyHighThroughput), Some(320));
        // The same beacon, read by a Wi-Fi 6 link.
        assert_eq!(channel_width_mhz(&ies, Generation::HighEfficiency), Some(160));
    }

    #[test]
    fn missing_or_truncated_elements_give_none() {
        assert_eq!(channel_width_mhz(&ssid(), Generation::HighEfficiency), None);
        // A VHT element whose length runs past the end.
        assert_eq!(channel_width_mhz(&[VHT_OPERATION, 5, 1, 42], Generation::VeryHighThroughput), None);
        assert_eq!(channel_width_mhz(&[], Generation::HighThroughput), None);
    }
}
