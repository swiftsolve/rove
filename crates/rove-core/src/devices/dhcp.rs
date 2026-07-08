//! Passive DHCP fingerprinting — identity from the packets a device broadcasts
//! when it joins the network.
//!
//! When a host joins (or renews after a reboot / lease rebind) it broadcasts a
//! DHCP `DISCOVER`/`REQUEST` to `255.255.255.250:67`. Two fields inside are a
//! near-signature of the device's OS/stack:
//!
//!   * **Option 55 (Parameter Request List)** — the *order* of options a client
//!     asks for is highly specific to its DHCP implementation, so iOS, Android,
//!     Windows and embedded stacks each look distinct. This is the classic
//!     "DHCP fingerprint".
//!   * **Option 60 (Vendor Class Identifier)** — often names the stack outright
//!     (`android-dhcp-14`, `MSFT 5.0`, `dhcpcd-9.4.1`), and is stabler than the
//!     PRL across OS versions, so we lean on it first.
//!
//! Why this matters: it is **passive** (no probing) and it **survives MAC
//! randomization** — the OUI-vendor signal is decreasingly reliable on modern
//! phones, but the fingerprint still reveals the OS family.
//!
//! Two design notes:
//!   * Hits are keyed by **MAC**, not IP: during `DISCOVER` the client has no
//!     address yet (source `0.0.0.0`), so IP is meaningless here. The scan joins
//!     these hits to the neighbor table by MAC.
//!   * DHCP traffic is sporadic (leases renew on the order of hours), so a
//!     single 3 s scan window would almost never catch a packet. Instead a
//!     background listener runs for the app's lifetime and accumulates a
//!     MAC→hit cache; each scan snapshots whatever has been seen so far. The
//!     listener also captures exactly the "a new device just joined" moment,
//!     which the planned alerts feature will reuse.
//!
//! Binding UDP :67 is privileged (root, or `cap_net_bind_service` on Linux; the
//! `.deb`/`.rpm` post-install script is the place to grant that). Without the
//! privilege the bind fails and the whole thing degrades silently to empty —
//! consistent with the rest of the scanner's "missing value renders as —" rule.
//!
//! Classification is table-driven from `data/dhcp_fingerprints.tsv` (a curated,
//! license-clean, offline table, same pattern as the OUI vendor list) — no key,
//! no network, no per-user cost.
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::{LazyLock, Mutex, Once, OnceLock};

use serde::{Deserialize, Serialize};
use tokio::net::UdpSocket;

const DHCP_SERVER_PORT: u16 = 67;
/// 236-byte fixed BOOTP header + 4-byte magic cookie: the shortest packet that
/// can carry any options.
const BOOTP_MIN_LEN: usize = 240;
/// The `99, 130, 83, 99` magic cookie that precedes the DHCP options.
const MAGIC_COOKIE: [u8; 4] = [99, 130, 83, 99];

/// What a device's DHCP solicitation reveals. Mirrors [`crate::mdns::MdnsHit`]
/// and [`crate::devices::ssdp::SsdpHit`] so the classifier treats it as one more
/// weighted signal.
#[derive(Debug, Clone, Default)]
pub struct DhcpHit {
    /// Option 55 parameter-request list, comma-joined (e.g. "1,3,6,15,119,252").
    /// Matched against the local fingerprint table to derive `kind`/`os`.
    pub fingerprint: Option<String>,
    /// Option 60 vendor class identifier, e.g. "android-dhcp-14", "MSFT 5.0".
    pub vendor_class: Option<String>,
    /// Option 12 hostname — the client's self-reported name, often better than
    /// reverse DNS and available for non-Windows hosts NetBIOS misses.
    pub hostname: Option<String>,
    /// Best-effort device kind from the local fingerprint table.
    pub kind: Option<&'static str>,
    /// Best-effort OS family from the local fingerprint table.
    pub os: Option<&'static str>,
}

/// The serializable, observed-only fields of a capture — what the privileged
/// macOS helper writes to disk for the app to read. The derived `kind`/`os`
/// borrow `'static` table data and can't be deserialized, so they're recomputed
/// from the current fingerprint table on load (which also lets a table update
/// re-classify old captures for free).
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
        let (kind, os) =
            classify_fingerprint(self.vendor_class.as_deref(), self.fingerprint.as_deref());
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
static CACHE: LazyLock<Mutex<HashMap<String, DhcpHit>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
/// Ensures the listener is spawned at most once, on the first scan.
static START: Once = Once::new();

/// Listener state, so the UI can distinguish "no fingerprints yet" from "this
/// build can't fingerprint at all". 0 = starting, 1 = active, 2 = unavailable.
static STATUS: AtomicU8 = AtomicU8::new(0);

/// The listener's state as a stable string for the wire: "starting" until the
/// bind resolves, then "active" (listening) or "unavailable" (no privilege).
pub fn status() -> &'static str {
    match STATUS.load(Ordering::Relaxed) {
        1 => "active",
        2 => "unavailable",
        _ => "starting",
    }
}

/// Snapshot the DHCP hits captured so far, keyed by normalized MAC. Starts the
/// background listener on first call. Cheap: a map clone plus a one-time spawn.
///
/// The first scan of a session sees an empty map (nothing captured yet); every
/// scan afterward includes any device that has joined or renewed since startup.
pub fn snapshot() -> HashMap<String, DhcpHit> {
    START.call_once(|| {
        // `snapshot` is only ever called from within the async scan, so a Tokio
        // runtime is present. If the bind fails (no privilege) the task simply
        // ends and the cache stays empty — no retry, privilege won't appear
        // mid-run.
        tokio::spawn(async {
            let _ = listen_forever().await;
        });
    });
    let mut map = CACHE.lock().unwrap().clone();
    // Merge whatever a privileged helper captured. This is the macOS path: the
    // app itself can't bind :67, so a root LaunchDaemon (`rove-dhcp-helper`)
    // does the capture and writes it here. In-process captures win on conflict.
    for (mac, hit) in load_from_file(helper_cache_path()) {
        map.entry(mac).or_insert(hit);
    }
    map
}

/// Normalize a MAC to 12 lowercase hex chars so the cache key matches the
/// neighbor table regardless of separator or case.
pub fn normalize_mac(mac: &str) -> String {
    mac.chars()
        .filter(|c| c.is_ascii_hexdigit())
        .flat_map(|c| c.to_ascii_lowercase().to_string().chars().collect::<Vec<_>>())
        .collect()
}

/// Bind `:67` and deliver each parsed client fingerprint to `on_hit`. Shared by
/// the in-process listener and the privileged helper, so both capture and parse
/// identically.
///
/// Binds INADDR_ANY so broadcast DISCOVER/REQUEST datagrams (destined to
/// 255.255.255.255:67) are delivered. Renewals a client unicasts straight to the
/// router are not seen — the join/rebind broadcasts carry the fingerprint.
/// Binding :67 is privileged; a failure (no root / no cap_net_bind_service) is
/// the expected unprivileged case, recorded as "unavailable".
async fn capture_loop(mut on_hit: impl FnMut(String, DhcpHit)) -> std::io::Result<()> {
    let socket = match UdpSocket::bind(("0.0.0.0", DHCP_SERVER_PORT)).await {
        Ok(socket) => {
            STATUS.store(1, Ordering::Relaxed);
            socket
        }
        Err(e) => {
            STATUS.store(2, Ordering::Relaxed);
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

/// In-process listener: capture into the shared cache (Linux/Windows path).
async fn listen_forever() -> std::io::Result<()> {
    capture_loop(|mac, hit| {
        CACHE.lock().unwrap().insert(mac, hit);
    })
    .await
}

/// Run the capture loop as a privileged helper, persisting the running set of
/// captures to `path` after each new device (atomic write). The unprivileged app
/// reads this file via [`snapshot`]. Requires root / the `:67` privilege — this
/// is the entry point for the macOS `rove-dhcp-helper` LaunchDaemon.
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

/// The shared path the privileged helper writes and the app reads — a
/// world-readable location the root daemon owns.
pub fn helper_cache_path() -> PathBuf {
    if cfg!(target_os = "macos") {
        PathBuf::from("/Library/Application Support/Rove/dhcp-cache.json")
    } else if cfg!(target_os = "windows") {
        PathBuf::from(r"C:\ProgramData\Rove\dhcp-cache.json")
    } else {
        PathBuf::from("/var/lib/rove/dhcp-cache.json")
    }
}

/// Atomically write the capture set as JSON (temp file + rename), creating the
/// parent directory if needed.
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

/// Read captures a privileged helper wrote to `path`, re-deriving kind/os from
/// the current fingerprint table. Empty if the file is absent or malformed.
pub fn load_from_file(path: impl AsRef<Path>) -> HashMap<String, DhcpHit> {
    let Ok(bytes) = std::fs::read(path) else {
        return HashMap::new();
    };
    match serde_json::from_slice::<Vec<RawCapture>>(&bytes) {
        Ok(raw) => raw.into_iter().map(RawCapture::into_hit).collect(),
        Err(_) => HashMap::new(),
    }
}

/// Parse a BOOTP/DHCP client packet into `(normalized MAC, hit)`. Returns `None`
/// for anything that isn't a client solicitation we can fingerprint.
fn parse_packet(buf: &[u8]) -> Option<(String, DhcpHit)> {
    if buf.len() < BOOTP_MIN_LEN {
        return None;
    }
    // op == 1 is BOOTREQUEST (client → server); server replies are op == 2.
    if buf[0] != 1 {
        return None;
    }
    if buf[236..240] != MAGIC_COOKIE {
        return None;
    }
    // chaddr holds the client hardware address; hlen == 6 for Ethernet.
    if buf[2] as usize != 6 {
        return None;
    }
    let mac: String = buf[28..34].iter().map(|b| format!("{b:02x}")).collect();

    let mut prl: Option<String> = None;
    let mut vendor_class: Option<String> = None;
    let mut hostname: Option<String> = None;
    let mut msg_type: Option<u8> = None;

    // Options are a TLV stream: code byte, length byte, value — except Pad (0,
    // one byte, no length) and End (255, terminates).
    let mut i = BOOTP_MIN_LEN;
    while i < buf.len() {
        let code = buf[i];
        if code == 255 {
            break;
        }
        if code == 0 {
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
            53 => msg_type = val.first().copied(),
            55 => prl = Some(val.iter().map(u8::to_string).collect::<Vec<_>>().join(",")),
            60 => vendor_class = clean_str(val),
            12 => hostname = clean_str(val),
            _ => {}
        }
        i = end;
    }

    // Only fingerprint genuine client solicitations: DISCOVER (1), REQUEST (3),
    // INFORM (8). Skip RELEASE/DECLINE/etc., which carry no useful PRL.
    if !matches!(msg_type, Some(1) | Some(3) | Some(8)) {
        return None;
    }

    let (kind, os) = classify_fingerprint(vendor_class.as_deref(), prl.as_deref());
    Some((mac, DhcpHit { fingerprint: prl, vendor_class, hostname, kind, os }))
}

/// Bytes → a sanitized, non-empty display string (or `None`).
fn clean_str(bytes: &[u8]) -> Option<String> {
    let raw = String::from_utf8_lossy(bytes);
    let value = crate::net_util::sanitize_display(raw.trim());
    (!value.is_empty()).then_some(value)
}

/// The curated fingerprint table, embedded at compile time (same pattern as the
/// OUI vendor table). License-clean and offline — no key, no network, no
/// per-user cost.
static FINGERPRINT_DATA: &str = include_str!("../../data/dhcp_fingerprints.tsv");

/// How a table row is matched against a captured fingerprint.
enum Matcher {
    /// Case-insensitive substring on the Option 60 vendor class (pattern lowercase).
    Vendor,
    /// Exact match on the Option 55 parameter-request list.
    Prl,
    /// Prefix match on the Option 55 list (tolerates trailing options).
    PrlPrefix,
}

/// One row: how to match, and the `(os, kind)` it implies (either may be absent).
struct FingerprintRow {
    matcher: Matcher,
    pattern: &'static str,
    os: Option<&'static str>,
    kind: Option<&'static str>,
}

/// Parse the embedded TSV once. All fields borrow the `'static` embedded string,
/// so the returned kinds/OS names need no allocation and outlive every caller.
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
                let (Some(kind), Some(pattern), Some(os), Some(device)) =
                    (fields.next(), fields.next(), fields.next(), fields.next())
                else {
                    return None;
                };
                let matcher = match kind {
                    "vendor" => Matcher::Vendor,
                    "prl" => Matcher::Prl,
                    "prl_prefix" => Matcher::PrlPrefix,
                    _ => return None,
                };
                // A literal "-" means "this signal says nothing about that field".
                let field = |s: &'static str| (s != "-").then_some(s);
                Some(FingerprintRow { matcher, pattern, os: field(os), kind: field(device) })
            })
            .collect()
    })
}

/// Best-effort `(kind, os)` for a fingerprint, looked up in the curated table.
/// First matching row wins (vendor-class rows are ordered ahead of the
/// version-sensitive PRL rows).
fn classify_fingerprint(
    vendor_class: Option<&str>,
    prl: Option<&str>,
) -> (Option<&'static str>, Option<&'static str>) {
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
        let opts = [53, 1, 1, 60, 14, b'a', b'n', b'd', b'r', b'o', b'i', b'd', b'-', b'd', b'h', b'c', b'p', b'-', b'9'];
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
    fn normalize_mac_strips_separators_and_case() {
        assert_eq!(normalize_mac("AA:BB:CC:11:22:33"), "aabbcc112233");
        assert_eq!(normalize_mac("aa-bb-cc-11-22-33"), "aabbcc112233");
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
        assert_eq!(
            classify_fingerprint(None, Some("1,121,3,6,15,119,252")),
            (None, Some("Apple")),
        );
        // Real modern-iOS capture (randomized-MAC iPhone) — the tail drifted from
        // the classic PRL, so the match must key on the "1,121,3,6,15" prefix.
        assert_eq!(
            classify_fingerprint(None, Some("1,121,3,6,15,108,114,119,162,252")),
            (None, Some("Apple")),
        );
        // Trailing options still match the prefix.
        assert_eq!(
            classify_fingerprint(None, Some("1,15,3,6,44,46,47,31,33,121,249,43,252")),
            (Some("computer"), Some("Windows")),
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
        // Simulate the privileged helper writing a capture, then the app reading
        // it back. Note the input hit carries no os/kind — the load path must
        // recompute them from the fingerprint (that's the whole point).
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
