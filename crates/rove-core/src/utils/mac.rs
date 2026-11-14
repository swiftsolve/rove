//! A 48-bit Ethernet MAC address, parsed once where it enters Rove (the
//! neighbor table, a DHCP packet, the database) and compared, keyed and
//! printed as one canonical value from then on.
//!
//! Every source writes MACs differently: Linux `ip neigh` as `08:3a:8d:ac:04:d0`,
//! BSD `arp` with leading zeros dropped (`8:3a:8d:ac:4:d0`), Windows with dashes
//! in uppercase (`08-3A-8D-AC-04-D0`), and the DHCP helper's file as bare hex.
//! Parsing them all to [`MacAddress`] means they match each other, the OUI table
//! and this machine's own address. It prints, serializes and stores as the
//! lowercase, colon-separated, zero-padded form.
use rusqlite::types::{FromSql, FromSqlError, FromSqlResult, ToSql, ToSqlOutput, ValueRef};
use std::fmt;
use std::str::FromStr;

/// A MAC address: six octets, printed as `08:3a:8d:ac:04:d0`.
#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct MacAddress([u8; 6]);

/// Text that isn't a MAC address in any form [`MacAddress`] accepts.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("not a MAC address: {0:?}")]
pub struct ParseMacError(String);

impl MacAddress {
    pub const fn new(octets: [u8; 6]) -> Self {
        Self(octets)
    }

    pub const fn octets(self) -> [u8; 6] {
        self.0
    }

    /// Whether this is a group address (bit 0x01 of the first octet): broadcast
    /// `ff:ff:ff:ff:ff:ff`, IPv4 multicast `01:00:5e:…` and IPv6 multicast
    /// `33:33:…`. A device's own MAC never is.
    pub const fn is_multicast(self) -> bool {
        self.0[0] & 0x01 != 0
    }

    /// Whether the locally administered bit (0x02 of the first octet) is set,
    /// the mark of a privacy-randomized MAC.
    pub const fn is_locally_administered(self) -> bool {
        self.0[0] & 0x02 != 0
    }
}

impl fmt::Display for MacAddress {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let [a, b, c, d, e, g] = self.0;
        let text = format!("{a:02x}:{b:02x}:{c:02x}:{d:02x}:{e:02x}:{g:02x}");
        // `pad` so a width in the format string (`{:<18}`) still lines up.
        f.pad(&text)
    }
}

impl fmt::Debug for MacAddress {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(self, f)
    }
}

impl FromStr for MacAddress {
    type Err = ParseMacError;

    /// Six octets of 1 or 2 hex digits separated by `:` or `-`, in either case,
    /// or 12 hex digits with no separator.
    fn from_str(text: &str) -> Result<Self, Self::Err> {
        let invalid = || ParseMacError(text.to_string());
        let octet_texts: Vec<&str> = if text.contains([':', '-']) {
            text.split([':', '-']).collect()
        } else if text.len() == 12 && text.is_ascii() {
            (0..12).step_by(2).map(|start| &text[start..start + 2]).collect()
        } else {
            return Err(invalid());
        };
        if octet_texts.len() != 6 {
            return Err(invalid());
        }
        let mut octets = [0u8; 6];
        for (octet, octet_text) in octets.iter_mut().zip(octet_texts) {
            let is_hex = (1..=2).contains(&octet_text.len()) && octet_text.bytes().all(|b| b.is_ascii_hexdigit());
            if !is_hex {
                return Err(invalid());
            }
            *octet = u8::from_str_radix(octet_text, 16).map_err(|_| invalid())?;
        }
        Ok(Self(octets))
    }
}

impl serde::Serialize for MacAddress {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.collect_str(self)
    }
}

impl ToSql for MacAddress {
    fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
        Ok(ToSqlOutput::from(self.to_string()))
    }
}

/// Reads the canonical text the store writes. Text that doesn't parse is a
/// conversion error; the store's readers skip such a row rather than fail.
impl FromSql for MacAddress {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        value.as_str()?.parse().map_err(|e: ParseMacError| FromSqlError::Other(Box::new(e)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const EXPECTED: MacAddress = MacAddress::new([0x08, 0x3a, 0x8d, 0xac, 0x04, 0xd0]);

    #[test]
    fn parses_every_form_the_sources_write() {
        assert_eq!("08:3a:8d:ac:04:d0".parse(), Ok(EXPECTED));
        // BSD `arp` drops leading zeros; Windows uses dashes and uppercase.
        assert_eq!("8:3a:8d:AC:4:d0".parse(), Ok(EXPECTED));
        assert_eq!("08-3A-8D-AC-04-D0".parse(), Ok(EXPECTED));
        // The DHCP helper's older cache files key by bare hex.
        assert_eq!("083a8dac04d0".parse(), Ok(EXPECTED));
    }

    #[test]
    fn rejects_anything_else() {
        for text in ["", "b8:27", "08:3a:8d:ac:04", "08:3a:8d:ac:04:d0:11", "08:3a:8d:ac:04:d00", "08:3a:8d:ac:04:g0"] {
            assert!(text.parse::<MacAddress>().is_err(), "{text:?} should not parse");
        }
        assert!("083a8dac04d".parse::<MacAddress>().is_err());
        assert!("08:3a:8d::04:d0".parse::<MacAddress>().is_err());
        assert!("+8:3a:8d:ac:04:d0".parse::<MacAddress>().is_err());
    }

    #[test]
    fn displays_lowercase_colon_separated_and_zero_padded() {
        assert_eq!(EXPECTED.to_string(), "08:3a:8d:ac:04:d0");
        assert_eq!(format!("{EXPECTED:?}"), "08:3a:8d:ac:04:d0");
        assert_eq!(format!("{EXPECTED:<19}|"), "08:3a:8d:ac:04:d0  |");
    }

    #[test]
    fn round_trips_through_text_and_json() {
        let parsed: MacAddress = EXPECTED.to_string().parse().unwrap();
        assert_eq!(parsed, EXPECTED);
        assert_eq!(serde_json::to_string(&EXPECTED).unwrap(), "\"08:3a:8d:ac:04:d0\"");
    }

    #[test]
    fn round_trips_through_sqlite() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        let stored: String = conn.query_row("SELECT ?1", [EXPECTED], |row| row.get(0)).unwrap();
        assert_eq!(stored, "08:3a:8d:ac:04:d0");
        let read: MacAddress = conn.query_row("SELECT ?1", [stored], |row| row.get(0)).unwrap();
        assert_eq!(read, EXPECTED);
        let unparsable = conn.query_row("SELECT 'garbage'", [], |row| row.get::<_, MacAddress>(0));
        assert!(matches!(unparsable, Err(rusqlite::Error::FromSqlConversionFailure(..))));
    }

    #[test]
    fn group_addresses_are_multicast_and_device_addresses_are_not() {
        for group in ["ff:ff:ff:ff:ff:ff", "01:00:5e:00:00:fb", "33:33:00:00:00:01"] {
            assert!(group.parse::<MacAddress>().unwrap().is_multicast(), "{group}");
        }
        assert!(!EXPECTED.is_multicast());
        assert!(!"a2:00:00:00:00:00".parse::<MacAddress>().unwrap().is_multicast());
    }

    #[test]
    fn the_locally_administered_bit_marks_a_randomized_mac() {
        assert!("a2:00:00:00:00:00".parse::<MacAddress>().unwrap().is_locally_administered());
        assert!(!"b8:27:eb:00:00:00".parse::<MacAddress>().unwrap().is_locally_administered());
    }
}
