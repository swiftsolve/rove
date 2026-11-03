//! Passive DHCP fingerprinting: identity from the packets a device broadcasts
//! when it joins the network.
//!
//! On joining, or rebinding after a reboot, a host broadcasts a DHCP
//! `DISCOVER`/`REQUEST` to `255.255.255.255:67`. Two options in it nearly
//! identify its OS and stack:
//!
//!   * **Option 55 (Parameter Request List)**: the order of options a client
//!     asks for is specific to its DHCP implementation, so iOS, Android, Windows
//!     and embedded stacks each look distinct. The classic "DHCP fingerprint".
//!   * **Option 60 (Vendor Class Identifier)**: often names the stack outright
//!     (`android-dhcp-14`, `MSFT 5.0`, `dhcpcd-9.4.1`) and is stabler than the
//!     PRL across OS versions, so it's tried first.
//!
//! It's passive, and it survives MAC randomization, which makes the OUI vendor
//! less and less useful on modern phones.
//!
//!   * Hits are keyed by MAC: during `DISCOVER` the client has no address yet
//!     (source `0.0.0.0`). The scan joins them to the neighbor table by MAC.
//!   * Leases renew every few hours, so a 3 s scan window would almost never
//!     catch a packet. A background listener runs for the app's lifetime and
//!     fills a MAC-keyed cache that each scan snapshots.
//!
//! Binding UDP :67 needs root or `cap_net_bind_service` on Linux (the `.deb`
//! post-install grants it). Windows has no low-port restriction, and modern
//! macOS (verified on 26.x with the default `net.inet.ip.portrange` sysctls)
//! lets an unprivileged process bind it too. Where the bind is denied the cache
//! stays empty, and a privileged helper can backfill it (see
//! [`run_capture_to_file`]).
//!
//! Classification comes from `data/dhcp_fingerprints.tsv`, a curated,
//! license-clean table embedded like the OUI list: no key, no network.
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::{LazyLock, Mutex, Once, OnceLock};

use serde::{Deserialize, Serialize};
use tokio::net::UdpSocket;

const DHCP_SERVER_PORT: u16 = 67;
/// The 236-byte BOOTP header plus the 4-byte magic cookie: the shortest packet
/// that can carry options.
const BOOTP_MIN_LEN: usize = 240;
/// Precedes the DHCP options (RFC 2131).
const MAGIC_COOKIE: [u8; 4] = [99, 130, 83, 99];

/// DHCP option codes (RFC 2132) the parser reads.
const OPT_PAD: u8 = 0;
const OPT_HOSTNAME: u8 = 12;
const OPT_MESSAGE_TYPE: u8 = 53;
const OPT_PARAMETER_REQUEST_LIST: u8 = 55;
const OPT_VENDOR_CLASS: u8 = 60;
const OPT_END: u8 = 255;

/// What a device's DHCP solicitation reveals. Mirrors
/// [`crate::devices::mdns::MdnsHit`] and `ssdp::SsdpHit` so the
/// classifier treats it as one more weighted signal.
#[derive(Debug, Clone, Default)]
pub struct DhcpHit {
    /// Option 55 parameter-request list, comma-joined (e.g. "1,3,6,15,119,252").
    /// Matched against the local fingerprint table to derive `kind`/`os`.
    pub fingerprint: Option<String>,
    /// Option 60 vendor class identifier, e.g. "android-dhcp-14", "MSFT 5.0".
    pub vendor_class: Option<String>,
    /// Option 12 hostname: the client's own name, often better than reverse DNS
    /// and present on non-Windows hosts NetBIOS misses.
    pub hostname: Option<String>,
    /// Best-effort device kind from the local fingerprint table.
    pub kind: Option<&'static str>,
    /// Best-effort OS family from the local fingerprint table.
    pub os: Option<&'static str>,
}

/// The observed fields of a capture, as the privileged helper writes them for
/// the app. `kind` and `os` borrow `'static` table data and can't be
/// deserialized, so they're recomputed on load, which also lets a table update
/// reclassify old captures.
#[derive(Serialize, Deserialize)]
struct RawCapture {
    mac: String,
    #[serde(default)]
    hostname: Option<String>,
    #[serde(default, rename = "vendorClass")]
    vendor_class: Option<String>,
    #[serde(default)]
    fingerprint: Option<String>,
}

impl RawCapture {
    fn from_hit(mac: &str, hit: &DhcpHit) -> Self {
        Self {
            mac: mac.to_string(),
            hostname: hit.hostname.clone(),
            vendor_class: hit.vendor_class.clone(),
            fingerprint: hit.fingerprint.clone(),
        }
    }

    fn into_hit(self) -> (String, DhcpHit) {
        let (kind, os) = classify_fingerprint(self.vendor_class.as_deref(), self.fingerprint.as_deref());
        let hit = DhcpHit {
            fingerprint: self.fingerprint,
            vendor_class: self.vendor_class,
            hostname: self.hostname,
            kind,
            os,
        };
        (self.mac, hit)
    }
}

/// Lifetime cache of everything the background listener has seen, keyed by
/// normalized MAC (12 lowercase hex chars, no separators).
static CACHE: LazyLock<Mutex<HashMap<String, DhcpHit>>> = LazyLock::new(|| Mutex::new(HashMap::new()));
/// Ensures the listener is spawned at most once, on the first scan.
static START: Once = Once::new();

/// Lets the UI tell "no fingerprints yet" from "can't fingerprint at all".
/// One of the `STATUS_*` values.
static STATUS: AtomicU8 = AtomicU8::new(STATUS_STARTING);
const STATUS_STARTING: u8 = 0;
const STATUS_ACTIVE: u8 = 1;
const STATUS_UNAVAILABLE: u8 = 2;

/// "starting" until the bind resolves, then "active" or "unavailable".
pub fn status() -> &'static str {
    match STATUS.load(Ordering::Relaxed) {
        STATUS_ACTIVE => "active",
        STATUS_UNAVAILABLE => "unavailable",
        _ => "starting",
    }
}

/// The DHCP hits captured so far, keyed by normalized MAC. The first call
/// starts the listener, so the first scan of a session sees only what the
/// helper file holds.
pub fn snapshot() -> HashMap<String, DhcpHit> {
    START.call_once(|| {
        // Only called from the async scan, so a Tokio runtime is present. A
        // failed bind isn't retried: privilege won't appear mid-run.
        tokio::spawn(async {
            let _ = listen_forever().await;
        });
    });
    let mut map = crate::util::net::lock(&CACHE).clone();
    // A root `rove-dhcp-helper` covers setups where the in-process bind is
    // denied (older macOS reserving low ports, or :67 held by another daemon).
    // The file is usually absent. In-process wins on conflict.
    for (mac, hit) in load_from_file(helper_cache_path()) {
        map.entry(mac).or_insert(hit);
    }
    map
}

/// Bind `:67` and hand each parsed fingerprint to `on_hit`. Shared by the
/// in-process listener and the helper so both parse identically.
///
/// Binds INADDR_ANY so broadcasts to 255.255.255.255:67 arrive. Renewals a
/// client unicasts to the router aren't seen; the join and rebind broadcasts
/// carry the fingerprint. A failed bind is the expected unprivileged case.
async fn capture_loop(mut on_hit: impl FnMut(String, DhcpHit)) -> std::io::Result<()> {
    let socket = match UdpSocket::bind(("0.0.0.0", DHCP_SERVER_PORT)).await {
        Ok(socket) => {
            STATUS.store(STATUS_ACTIVE, Ordering::Relaxed);
            socket
        }
        Err(e) => {
            STATUS.store(STATUS_UNAVAILABLE, Ordering::Relaxed);
            return Err(e);
        }
    };
    let mut buf = vec![0u8; 1500];
    loop {
        let (n, _src) = socket.recv_from(&mut buf).await?;
        if let Some((mac, hit)) = parse_packet(&buf[..n]) {
            on_hit(mac, hit);
        }
    }
}

/// The in-process listener, capturing into the shared cache.
async fn listen_forever() -> std::io::Result<()> {
    capture_loop(|mac, hit| {
        crate::util::net::lock(&CACHE).insert(mac, hit);
    })
    .await
}

/// The `rove-dhcp-helper` entry point, for setups where the app can't bind :67
/// (Linux without the file capability, older macOS reserving low ports). Writes
/// every capture so far to `path` after each packet; [`snapshot`] reads it.
pub async fn run_capture_to_file(path: impl AsRef<Path>) -> std::io::Result<()> {
    let path = path.as_ref().to_path_buf();
    let mut seen: HashMap<String, DhcpHit> = HashMap::new();
    capture_loop(move |mac, hit| {
        seen.insert(mac, hit);
        if let Err(e) = write_cache_file(&path, &seen) {
            eprintln!("rove-dhcp-helper: failed to write {}: {e}", path.display());
        }
    })
    .await
}

/// The path the helper writes and the app reads: world-readable, owned by the
/// root daemon.
pub fn helper_cache_path() -> PathBuf {
    if cfg!(target_os = "macos") {
        PathBuf::from("/Library/Application Support/Rove/dhcp-cache.json")
    } else if cfg!(target_os = "windows") {
        PathBuf::from(r"C:\ProgramData\Rove\dhcp-cache.json")
    } else {
        PathBuf::from("/var/lib/rove/dhcp-cache.json")
    }
}

/// Temp file then rename, so the app never reads a half-written file.
fn write_cache_file(path: &Path, cache: &HashMap<String, DhcpHit>) -> std::io::Result<()> {
    let raw: Vec<RawCapture> = cache.iter().map(|(mac, hit)| RawCapture::from_hit(mac, hit)).collect();
    let json = serde_json::to_vec(&raw).map_err(std::io::Error::other)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, &json)?;
    std::fs::rename(&tmp, path)
}

/// Captures the helper wrote to `path`, reclassified with the current table.
/// Empty if the file is absent or malformed.
pub fn load_from_file(path: impl AsRef<Path>) -> HashMap<String, DhcpHit> {
    let Ok(bytes) = std::fs::read(path) else {
        return HashMap::new();
    };
    match serde_json::from_slice::<Vec<RawCapture>>(&bytes) {
        Ok(raw) => raw.into_iter().map(RawCapture::into_hit).collect(),
        Err(_) => HashMap::new(),
    }
}

/// A client packet as `(normalized MAC, hit)`; `None` for anything that isn't a
/// solicitation we can fingerprint.
fn parse_packet(buf: &[u8]) -> Option<(String, DhcpHit)> {
    if buf.len() < BOOTP_MIN_LEN {
        return None;
    }
    // op 1 is BOOTREQUEST; server replies are op 2.
    if buf[0] != 1 {
        return None;
    }
    if buf[236..240] != MAGIC_COOKIE {
        return None;
    }
    // hlen 6 means chaddr holds an Ethernet MAC.
    if buf[2] as usize != 6 {
        return None;
    }
    let mac: String = buf[28..34].iter().map(|b| format!("{b:02x}")).collect();

    let mut prl: Option<String> = None;
    let mut vendor_class: Option<String> = None;
    let mut hostname: Option<String> = None;
    let mut msg_type: Option<u8> = None;

    // Options are code, length, value, except the one-byte Pad and End.
    let mut i = BOOTP_MIN_LEN;
    while i < buf.len() {
        let code = buf[i];
        if code == OPT_END {
            break;
        }
        if code == OPT_PAD {
            i += 1;
            continue;
        }
        if i + 1 >= buf.len() {
            break;
        }
        let len = buf[i + 1] as usize;
        let start = i + 2;
        let end = start + len;
        if end > buf.len() {
            break;
        }
        let val = &buf[start..end];
        match code {
            OPT_MESSAGE_TYPE => msg_type = val.first().copied(),
            OPT_PARAMETER_REQUEST_LIST => prl = Some(val.iter().map(u8::to_string).collect::<Vec<_>>().join(",")),
            OPT_VENDOR_CLASS => vendor_class = clean_str(val),
            OPT_HOSTNAME => hostname = clean_str(val),
            _ => {}
        }
        i = end;
    }

    // DISCOVER (1), REQUEST (3) and INFORM (8) only; RELEASE, DECLINE and the
    // rest carry no useful PRL.
    if !matches!(msg_type, Some(1) | Some(3) | Some(8)) {
        return None;
    }

    let (kind, os) = classify_fingerprint(vendor_class.as_deref(), prl.as_deref());
    Some((mac, DhcpHit { fingerprint: prl, vendor_class, hostname, kind, os }))
}

fn clean_str(bytes: &[u8]) -> Option<String> {
    let raw = String::from_utf8_lossy(bytes);
    let value = crate::util::net::sanitize_display(raw.trim());
    (!value.is_empty()).then_some(value)
}

static FINGERPRINT_DATA: &str = include_str!("../../data/dhcp_fingerprints.tsv");

/// How a table row is matched against a captured fingerprint.
enum Matcher {
    /// Case-insensitive substring of the Option 60 vendor class; the pattern is
    /// lowercase.
    Vendor,
    /// Exact match on the Option 55 parameter-request list.
    Prl,
    /// Prefix match on the Option 55 list (tolerates trailing options).
    PrlPrefix,
}

/// How to match, and the `os` and `kind` it implies (either may be absent).
struct FingerprintRow {
    matcher: Matcher,
    pattern: &'static str,
    os: Option<&'static str>,
    kind: Option<&'static str>,
}

/// Parsed once. Fields borrow the `'static` embedded string, so kinds and OS
/// names need no allocation.
fn fingerprint_table() -> &'static [FingerprintRow] {
    static TABLE: OnceLock<Vec<FingerprintRow>> = OnceLock::new();
    TABLE.get_or_init(|| {
        FINGERPRINT_DATA
            .lines()
            .filter_map(|line| {
                let line = line.trim();
                if line.is_empty() || line.starts_with('#') {
                    return None;
                }
                let mut fields = line.splitn(4, '\t');
                let (Some(match_type), Some(pattern), Some(os), Some(kind)) =
                    (fields.next(), fields.next(), fields.next(), fields.next())
                else {
                    return None;
                };
                let matcher = match match_type {
                    "vendor" => Matcher::Vendor,
                    "prl" => Matcher::Prl,
                    "prl_prefix" => Matcher::PrlPrefix,
                    _ => return None,
                };
                // "-" means the row says nothing about that field.
                let field = |s: &'static str| (s != "-").then_some(s);
                Some(FingerprintRow { matcher, pattern, os: field(os), kind: field(kind) })
            })
            .collect()
    })
}

/// Best-effort `(kind, os)` for a fingerprint. The first matching row wins, and
/// vendor-class rows come before the version-sensitive PRL rows.
fn classify_fingerprint(vendor_class: Option<&str>, prl: Option<&str>) -> (Option<&'static str>, Option<&'static str>) {
    let vendor_lc = vendor_class.map(|v| v.to_ascii_lowercase());
    for row in fingerprint_table() {
        let matched = match row.matcher {
            Matcher::Vendor => vendor_lc.as_deref().is_some_and(|v| v.contains(row.pattern)),
            Matcher::Prl => prl == Some(row.pattern),
            Matcher::PrlPrefix => prl.is_some_and(|p| p.starts_with(row.pattern)),
        };
        if matched {
            return (row.kind, row.os);
        }
    }
    (None, None)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a minimal but valid DHCP client packet with the given options tail.
    fn packet(options: &[u8]) -> Vec<u8> {
        let mut p = vec![0u8; BOOTP_MIN_LEN];
        p[0] = 1; // BOOTREQUEST
        p[1] = 1; // htype ethernet
        p[2] = 6; // hlen
        p[28..34].copy_from_slice(&[0xaa, 0xbb, 0xcc, 0x11, 0x22, 0x33]);
        p[236..240].copy_from_slice(&MAGIC_COOKIE);
        p.extend_from_slice(options);
        p.push(255); // End
        p
    }

    #[test]
    fn parses_mac_prl_vendor_and_hostname() {
        // Option 53 = DISCOVER, 55 = PRL [1,3,6,15], 60 = "MSFT 5.0", 12 = "my-pc".
        let opts = [
            53, 1, 1, //
            55, 4, 1, 3, 6, 15, //
            60, 8, b'M', b'S', b'F', b'T', b' ', b'5', b'.', b'0', //
            12, 5, b'm', b'y', b'-', b'p', b'c',
        ];
        let (mac, hit) = parse_packet(&packet(&opts)).expect("valid client packet");
        assert_eq!(mac, "aabbcc112233");
        assert_eq!(hit.fingerprint.as_deref(), Some("1,3,6,15"));
        assert_eq!(hit.vendor_class.as_deref(), Some("MSFT 5.0"));
        assert_eq!(hit.hostname.as_deref(), Some("my-pc"));
        assert_eq!(hit.kind, Some("computer"));
        assert_eq!(hit.os, Some("Windows"));
    }

    #[test]
    fn android_vendor_class_is_a_phone() {
        let opts =
            [53, 1, 1, 60, 14, b'a', b'n', b'd', b'r', b'o', b'i', b'd', b'-', b'd', b'h', b'c', b'p', b'-', b'9'];
        let (_, hit) = parse_packet(&packet(&opts)).expect("valid");
        assert_eq!(hit.kind, Some("phone"));
        assert_eq!(hit.os, Some("Android"));
    }

    #[test]
    fn server_replies_are_ignored() {
        let mut p = packet(&[53, 1, 2]); // ACK
        p[0] = 2; // BOOTREPLY
        assert!(parse_packet(&p).is_none());
    }

    #[test]
    fn non_solicitation_messages_are_ignored() {
        // Option 53 = RELEASE (7) carries no fingerprint worth keeping.
        assert!(parse_packet(&packet(&[53, 1, 7, 55, 2, 1, 3])).is_none());
    }

    #[test]
    fn truncated_option_does_not_panic() {
        // Length byte claims 8 bytes but only 2 follow.
        assert!(parse_packet(&packet(&[53, 1, 1, 60, 8, b'x', b'y'])).is_some());
    }

    #[test]
    fn table_loads_and_is_nonempty() {
        assert!(!fingerprint_table().is_empty());
    }

    #[test]
    fn vendor_class_table_lookups() {
        // Substring + case-insensitive: "Hewlett-Packard JetDirect" → printer.
        assert_eq!(classify_fingerprint(Some("Hewlett-Packard JetDirect"), None), (Some("printer"), None));
        // Router vendor, no OS implied.
        assert_eq!(classify_fingerprint(Some("ubnt"), None), (Some("router"), None));
        // Android vendor class → phone / Android.
        assert_eq!(classify_fingerprint(Some("android-dhcp-14"), None), (Some("phone"), Some("Android")));
    }

    #[test]
    fn prl_prefix_table_lookups() {
        // Apple's shared iOS/macOS PRL: OS known, kind deliberately left open.
        assert_eq!(classify_fingerprint(None, Some("1,121,3,6,15,119,252")), (None, Some("Apple")),);
        // A real modern-iOS capture whose tail drifted from the classic PRL, so
        // the match must key on the "1,121,3,6,15" prefix.
        assert_eq!(classify_fingerprint(None, Some("1,121,3,6,15,108,114,119,162,252")), (None, Some("Apple")),);
        // Trailing options still match the prefix.
        assert_eq!(
            classify_fingerprint(None, Some("1,15,3,6,44,46,47,31,33,121,249,43,252")),
            (Some("computer"), Some("Windows")),
        );
        // Android that omits the Option 60 vendor class is still caught by its
        // PRL prefix (trailing options drift across versions).
        assert_eq!(
            classify_fingerprint(None, Some("1,3,6,15,26,28,51,58,59,43,114")),
            (Some("phone"), Some("Android")),
        );
        // The bare 26,28,51,58,59 signature (no trailing 43) and newer builds
        // that extend the tail differently both resolve off the shortened prefix.
        assert_eq!(classify_fingerprint(None, Some("1,3,6,15,26,28,51,58,59")), (Some("phone"), Some("Android")),);
        assert_eq!(
            classify_fingerprint(None, Some("1,3,6,15,26,28,51,58,59,108,109,114,252")),
            (Some("phone"), Some("Android")),
        );
        // A build that requests the classless-static-route option (33) up front
        // before the same Android run.
        assert_eq!(
            classify_fingerprint(None, Some("1,33,3,6,15,26,28,51,58,59,43,114")),
            (Some("phone"), Some("Android")),
        );
    }

    #[test]
    fn vendor_class_wins_over_prl() {
        // A device sending both: the vendor-class row is ordered first.
        let (kind, os) = classify_fingerprint(Some("android-dhcp-14"), Some("1,121,3,6,15,119,252"));
        assert_eq!((kind, os), (Some("phone"), Some("Android")));
    }

    #[test]
    fn unknown_fingerprint_yields_nothing() {
        assert_eq!(classify_fingerprint(Some("totally-unknown-stack"), Some("99,98,97")), (None, None));
    }

    #[test]
    fn helper_file_ipc_round_trips_and_reclassifies() {
        // The helper writes a capture and the app reads it back. The written hit
        // has no os or kind; the load path must recompute them.
        let mut cache = HashMap::new();
        cache.insert(
            "ae4a06feb537".to_string(),
            DhcpHit {
                fingerprint: Some("1,121,3,6,15,108,114,119,162,252".into()),
                vendor_class: None,
                hostname: Some("iPhone".into()),
                kind: None,
                os: None,
            },
        );

        let path = std::env::temp_dir().join(format!("rove-dhcp-ipc-{}.json", std::process::id()));
        write_cache_file(&path, &cache).expect("write");
        let loaded = load_from_file(&path);
        std::fs::remove_file(&path).ok();

        let hit = loaded.get("ae4a06feb537").expect("capture present after round-trip");
        assert_eq!(hit.hostname.as_deref(), Some("iPhone"));
        assert_eq!(hit.fingerprint.as_deref(), Some("1,121,3,6,15,108,114,119,162,252"));
        // Recomputed from the table on load, even though the written hit had none.
        assert_eq!(hit.os, Some("Apple"));
    }

    #[test]
    fn load_from_missing_file_is_empty() {
        assert!(load_from_file("/nonexistent/rove/dhcp-cache.json").is_empty());
    }
}
