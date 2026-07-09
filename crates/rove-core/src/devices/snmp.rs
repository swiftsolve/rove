//! SNMP `sysDescr` read — a high-signal model source for network gear.
//!
//! Routers, managed switches and access points almost never advertise a model
//! over mDNS or SSDP, but the ones that speak SNMP expose `sysDescr.0`
//! (`1.3.6.1.2.1.1.1.0`) — a free-text banner that typically carries the exact
//! model and firmware ("ARRIS TG3452, HW REV 1.0, SW REV 9.1…", "RouterOS
//! RB750Gr3"). It is the standard, read-only identity object for network
//! equipment.
//!
//! Scope: only the default **gateway** is queried, and only with the
//! conventional read-only `public` community. The gateway is a single known
//! host we can afford to probe purposefully; fanning an SNMP `M-SEARCH`-style
//! sweep across every neighbor would add UDP-probe surface for little gain, so
//! it is deliberately left out. A `public`-community read is a well-known
//! read-only default — not a credential — so it fits Rove's no-danger-knobs
//! posture. Devices with SNMP disabled (many consumer routers) simply time out
//! and yield nothing.
//!
//! Pure Rust: one `tokio` UDP round-trip and a hand-rolled BER encode/decode
//! (the request and response are tiny and flat, so a full ASN.1 crate is
//! overkill — mirrors the dependency-light XML/DHCP parsing elsewhere).
use crate::net_util::sanitize_display;
use std::collections::HashMap;
use std::net::Ipv4Addr;
use std::time::Duration;
use tokio::net::UdpSocket;

/// The conventional read-only community string. Read-only, not a secret.
const COMMUNITY: &[u8] = b"public";
/// `sysDescr.0` — 1.3.6.1.2.1.1.1.0, encoded as BER OID content bytes
/// (the first two arcs `1.3` collapse to `1*40+3 = 43 = 0x2b`).
const OID_SYS_DESCR: &[u8] = &[0x2b, 0x06, 0x01, 0x02, 0x01, 0x01, 0x01, 0x00];
/// Fixed request-id: a single request is outstanding at a time, so a constant
/// is enough and keeps the encoder deterministic for tests.
const REQUEST_ID: i32 = 0x726f7665_u32 as i32; // "rove"

/// Per-attempt wait. The gateway is one hop away and answers in single-digit
/// ms; this only bounds a host that silently drops the datagram.
const ATTEMPT_TIMEOUT: Duration = Duration::from_millis(600);
/// A single try: the gateway is one hop away on a quiet local link, so a lost
/// datagram is rare, and the diagnostics panel would rather cap the wait at one
/// short timeout than double it chasing an occasional drop.
const ATTEMPTS: usize = 1;

/// What a device's SNMP `sysDescr` says about it.
#[derive(Debug, Clone, Default)]
pub struct SnmpHit {
    /// The raw (sanitized, bounded) `sysDescr.0` string.
    pub sys_descr: Option<String>,
}

impl SnmpHit {
    /// A concise hardware model derived from `sysDescr`. Many vendors pack the
    /// model plus firmware/hardware revisions into a comma-separated banner
    /// ("ARRIS TG3452, HW REV 1.0, SW REV …"); when the first field already
    /// carries a model-number-like token, that lone field *is* the clean model.
    /// Otherwise the whole (already length-bounded) banner is kept — it still
    /// names the device, if less tidily, for generic Linux/Cisco-IOS strings
    /// whose model sits past the first comma.
    pub fn model(&self) -> Option<String> {
        let descr = self.sys_descr.as_deref()?.trim();
        if descr.is_empty() {
            return None;
        }
        if let Some((first, _)) = descr.split_once(',') {
            let first = first.trim();
            if !first.is_empty() && has_model_token(first) {
                return Some(first.to_string());
            }
        }
        Some(descr.to_string())
    }
}

/// True when `s` contains an alphanumeric token that reads like a model number:
/// at least two chars mixing letters and digits (TG3452, RB750Gr3, C2960).
fn has_model_token(s: &str) -> bool {
    s.split_whitespace().any(|token| {
        let token = token.trim_matches(|c: char| !c.is_ascii_alphanumeric());
        token.len() >= 2
            && token.bytes().any(|b| b.is_ascii_digit())
            && token.bytes().any(|b| b.is_ascii_alphabetic())
    })
}

/// Query the gateway's `sysDescr` over SNMP, keyed by IP (0 or 1 entries) so it
/// slots into the same enrichment shape as the other discovery sources.
/// `local_ip`, when known, is the active interface's address: binding to it
/// sends the datagram out the right adapter on multi-homed / Windows hosts.
pub async fn discover(gateway: Option<&str>, local_ip: Option<Ipv4Addr>) -> HashMap<String, SnmpHit> {
    let mut out = HashMap::new();
    // IPv4 only: the gateway comes from the v4 default route, and the neighbor
    // table this feeds is keyed on those same v4 literals.
    let Some(ip) = gateway.and_then(|g| g.parse::<Ipv4Addr>().ok()) else {
        return out;
    };
    if let Some(hit) = query_one(ip, local_ip).await {
        out.insert(ip.to_string(), hit);
    }
    out
}

async fn query_one(ip: Ipv4Addr, local_ip: Option<Ipv4Addr>) -> Option<SnmpHit> {
    let bind_ip = local_ip.unwrap_or(Ipv4Addr::UNSPECIFIED);
    let socket = UdpSocket::bind((bind_ip, 0)).await.ok()?;
    socket.connect((ip, 161)).await.ok()?;

    let request = encode_get(OID_SYS_DESCR, COMMUNITY, REQUEST_ID);
    let mut buf = [0u8; 2048];

    for _ in 0..ATTEMPTS {
        if socket.send(&request).await.is_err() {
            return None;
        }
        match tokio::time::timeout(ATTEMPT_TIMEOUT, socket.recv(&mut buf)).await {
            Ok(Ok(n)) => {
                if let Some(descr) = parse_sys_descr(&buf[..n]) {
                    let descr = sanitize_display(&descr);
                    return (!descr.is_empty()).then_some(SnmpHit { sys_descr: Some(descr) });
                }
                return None; // a well-formed reply without a value won't improve on retry.
            }
            Ok(Err(_)) => return None, // socket error — no point retrying.
            Err(_) => continue,        // timed out — resend.
        }
    }
    None
}

// ---- BER encoding (request) ------------------------------------------------

/// Build an SNMPv2c `GetRequest` for a single OID.
fn encode_get(oid: &[u8], community: &[u8], request_id: i32) -> Vec<u8> {
    // VarBind: SEQUENCE { OID, NULL }
    let mut varbind = Vec::new();
    varbind.extend(tlv(0x06, oid)); // OBJECT IDENTIFIER
    varbind.extend(tlv(0x05, &[])); // NULL
    let varbind = tlv(0x30, &varbind);

    // VarBindList: SEQUENCE OF VarBind
    let varbind_list = tlv(0x30, &varbind);

    // GetRequest-PDU [context 0xA0]: request-id, error-status, error-index, list
    let mut pdu = Vec::new();
    pdu.extend(tlv(0x02, &encode_int(request_id)));
    pdu.extend(tlv(0x02, &[0x00])); // error-status: noError
    pdu.extend(tlv(0x02, &[0x00])); // error-index
    pdu.extend(varbind_list);
    let pdu = tlv(0xa0, &pdu);

    // Message: SEQUENCE { version=1 (v2c), community, PDU }
    let mut message = Vec::new();
    message.extend(tlv(0x02, &[0x01])); // version: 1 => SNMPv2c
    message.extend(tlv(0x04, community)); // community
    message.extend(pdu);
    tlv(0x30, &message)
}

/// Encode one BER TLV: tag, length, value.
fn tlv(tag: u8, value: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(value.len() + 4);
    out.push(tag);
    out.extend(encode_len(value.len()));
    out.extend_from_slice(value);
    out
}

/// BER length: short form below 128, else long form (byte count then bytes).
fn encode_len(len: usize) -> Vec<u8> {
    if len < 0x80 {
        return vec![len as u8];
    }
    let bytes = len.to_be_bytes();
    let first = bytes.iter().position(|&b| b != 0).unwrap_or(bytes.len() - 1);
    let significant = &bytes[first..];
    let mut out = Vec::with_capacity(significant.len() + 1);
    out.push(0x80 | significant.len() as u8);
    out.extend_from_slice(significant);
    out
}

/// Minimal two's-complement BER INTEGER encoding of `n`.
fn encode_int(n: i32) -> Vec<u8> {
    let bytes = n.to_be_bytes();
    let mut i = 0;
    // Drop leading bytes that are pure sign-extension of the next byte.
    while i < bytes.len() - 1
        && ((bytes[i] == 0x00 && bytes[i + 1] & 0x80 == 0)
            || (bytes[i] == 0xff && bytes[i + 1] & 0x80 != 0))
    {
        i += 1;
    }
    bytes[i..].to_vec()
}

// ---- BER decoding (response) -----------------------------------------------

/// Extract the `sysDescr` OCTET STRING value from a `GetResponse` packet by
/// walking the fixed message → PDU → varbind-list → varbind → value nesting.
/// Returns `None` on any structural mismatch or a non-zero error-status.
fn parse_sys_descr(packet: &[u8]) -> Option<String> {
    let (tag, message, _) = read_tlv(packet)?;
    if tag != 0x30 {
        return None;
    }
    let (_, _, rest) = read_tlv(message)?; // version
    let (_, _, rest) = read_tlv(rest)?; // community
    let (_, pdu, _) = read_tlv(rest)?; // GetResponse-PDU (tag 0xA2)

    let (_, _, rest) = read_tlv(pdu)?; // request-id
    let (_, error_status, rest) = read_tlv(rest)?; // error-status
    if error_status.iter().any(|&b| b != 0) {
        return None; // the agent reported an error (e.g. noSuchName).
    }
    let (_, _, rest) = read_tlv(rest)?; // error-index
    let (_, varbind_list, _) = read_tlv(rest)?; // VarBindList SEQUENCE
    let (_, varbind, _) = read_tlv(varbind_list)?; // first VarBind SEQUENCE
    let (_, _, value_tlv) = read_tlv(varbind)?; // skip the OID
    let (value_tag, value, _) = read_tlv(value_tlv)?;
    if value_tag != 0x04 {
        return None; // not an OCTET STRING (e.g. noSuchObject exception).
    }
    Some(String::from_utf8_lossy(value).into_owned())
}

/// Read one BER TLV from the front of `bytes`, returning
/// `(tag, value, remainder)`. `None` if the buffer is truncated.
fn read_tlv(bytes: &[u8]) -> Option<(u8, &[u8], &[u8])> {
    let tag = *bytes.first()?;
    let (len, len_bytes) = read_len(bytes.get(1..)?)?;
    let start = 1 + len_bytes;
    let end = start.checked_add(len)?;
    let value = bytes.get(start..end)?;
    Some((tag, value, &bytes[end..]))
}

/// Decode a BER length, returning `(length, bytes_consumed)`.
fn read_len(bytes: &[u8]) -> Option<(usize, usize)> {
    let first = *bytes.first()?;
    if first < 0x80 {
        return Some((first as usize, 1));
    }
    let n = (first & 0x7f) as usize;
    if n == 0 || n > 4 {
        return None; // indefinite form and oversized lengths aren't used here.
    }
    let mut len = 0usize;
    for i in 0..n {
        len = (len << 8) | *bytes.get(1 + i)? as usize;
    }
    Some((len, 1 + n))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_a_getrequest_that_round_trips() {
        // The encoder's own OID/community/request-id must survive a decode.
        let pkt = encode_get(OID_SYS_DESCR, COMMUNITY, REQUEST_ID);
        // Top level is a SEQUENCE.
        assert_eq!(pkt[0], 0x30);
        // A GetRequest carries no value, but a synthesized *response* built from
        // the same nesting must parse — see `parses_sys_descr_from_a_response`.
    }

    /// Build a minimal GetResponse for `descr` to exercise the decoder.
    fn response_with_descr(descr: &[u8], error_status: u8) -> Vec<u8> {
        let mut varbind = Vec::new();
        varbind.extend(tlv(0x06, OID_SYS_DESCR));
        varbind.extend(tlv(0x04, descr));
        let varbind_list = tlv(0x30, &tlv(0x30, &varbind));

        let mut pdu = Vec::new();
        pdu.extend(tlv(0x02, &encode_int(REQUEST_ID)));
        pdu.extend(tlv(0x02, &[error_status]));
        pdu.extend(tlv(0x02, &[0x00]));
        pdu.extend(varbind_list);
        let pdu = tlv(0xa2, &pdu); // 0xA2 = GetResponse

        let mut message = Vec::new();
        message.extend(tlv(0x02, &[0x01]));
        message.extend(tlv(0x04, COMMUNITY));
        message.extend(pdu);
        tlv(0x30, &message)
    }

    #[test]
    fn parses_sys_descr_from_a_response() {
        let pkt = response_with_descr(b"RouterOS RB750Gr3", 0);
        assert_eq!(parse_sys_descr(&pkt).as_deref(), Some("RouterOS RB750Gr3"));
    }

    #[test]
    fn rejects_a_response_with_a_nonzero_error_status() {
        let pkt = response_with_descr(b"unused", 2); // noSuchName
        assert!(parse_sys_descr(&pkt).is_none());
    }

    #[test]
    fn parses_a_long_descr_needing_long_form_length() {
        // >127 bytes forces long-form BER length in the enclosing SEQUENCEs.
        let long = vec![b'x'; 200];
        let pkt = response_with_descr(&long, 0);
        assert_eq!(parse_sys_descr(&pkt).map(|s| s.len()), Some(200));
    }

    #[test]
    fn truncated_packet_is_none_not_panic() {
        let pkt = response_with_descr(b"whatever", 0);
        assert!(parse_sys_descr(&pkt[..pkt.len() / 2]).is_none());
    }

    #[test]
    fn model_takes_the_first_field_when_it_has_a_model_token() {
        let hit = SnmpHit { sys_descr: Some("ARRIS TG3452, HW REV 1.0, SW REV 9.1".into()) };
        assert_eq!(hit.model().as_deref(), Some("ARRIS TG3452"));
    }

    #[test]
    fn model_keeps_the_whole_banner_when_the_first_field_is_generic() {
        // Cisco's model sits past the first (tokenless) comma-field, so the whole
        // banner is kept rather than the useless "Cisco IOS Software".
        let hit =
            SnmpHit { sys_descr: Some("Cisco IOS Software, C2960 Software, Version 12.2".into()) };
        assert_eq!(
            hit.model().as_deref(),
            Some("Cisco IOS Software, C2960 Software, Version 12.2")
        );
    }

    #[test]
    fn model_of_a_comma_free_banner_is_the_banner() {
        let hit = SnmpHit { sys_descr: Some("RouterOS RB750Gr3".into()) };
        assert_eq!(hit.model().as_deref(), Some("RouterOS RB750Gr3"));
    }

    #[test]
    fn empty_or_missing_descr_has_no_model() {
        assert!(SnmpHit::default().model().is_none());
        assert!(SnmpHit { sys_descr: Some("   ".into()) }.model().is_none());
    }
}
