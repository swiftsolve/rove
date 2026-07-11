//! Build a "join this Wi-Fi" payload for the current connection: the SSID, the
//! encryption type and — where the OS lets us read it — the saved passphrase,
//! plus a ready-to-scan QR code. The QR encodes the standard `WIFI:` URI that
//! iOS and Android cameras recognise to offer one-tap joining.
//!
//! Reading the passphrase is the privileged part and is deliberately best
//! effort: every OS guards saved Wi-Fi secrets behind an auth prompt — a polkit
//! dialog on Linux, a Keychain prompt on macOS, Administrator elevation on
//! Windows. When the user declines, or we aren't running with the rights to
//! read it, the passphrase comes back `None` and we still return an SSID-only
//! QR. Scanners use that to pre-fill the network name and prompt for the
//! password by hand.

use crate::network_info::network_info;
use crate::platform;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WifiShare {
    pub ssid: String,
    /// QR encryption token: `"WPA"`, `"WEP"` or `"nopass"`.
    pub encryption: String,
    /// The saved passphrase, when the OS allowed us to read it. `None` for open
    /// networks, and for secured ones whose secret we couldn't retrieve.
    pub password: Option<String>,
    /// A self-contained SVG QR code of the `WIFI:` join URI, ready to drop into
    /// an `<img>` as a data URI.
    pub qr_svg: String,
}

/// Assemble the share payload for whatever Wi-Fi network is currently active.
/// Errors (as a display string for the frontend) when there's no Wi-Fi link or
/// its SSID is unavailable — the two states where there's nothing to share.
pub async fn current_wifi_share() -> Result<WifiShare, String> {
    let info = network_info().await;
    if info.connection_type != "wifi" {
        return Err("Not connected to Wi-Fi.".into());
    }

    let ssid = info
        .details
        .ssid
        .clone()
        .filter(|s| !s.is_empty())
        // macOS withholds the SSID without Location Services; the message points
        // at the likely cause without asserting it.
        .ok_or("Wi-Fi network name is unavailable.")?;

    let iface = info.interface_name.clone().unwrap_or_default();
    let encryption = encryption_token(info.details.security.as_deref());

    // Open networks have no secret to read, so skip the (prompt-triggering)
    // lookup entirely.
    let password = if encryption == "nopass" {
        None
    } else {
        read_password(&iface, &ssid).await
    };

    let uri = build_wifi_uri(&ssid, &encryption, password.as_deref());
    let qr_svg = qr_svg(&uri)?;

    Ok(WifiShare { ssid, encryption, password, qr_svg })
}

/// Dispatch the passphrase read to the running OS's probe. Mirrors the runtime
/// dispatch in [`crate::network_info::connection_details`] — every platform
/// module compiles everywhere, so we pick by `std::env::consts::OS`.
async fn read_password(iface: &str, ssid: &str) -> Option<String> {
    match std::env::consts::OS {
        "linux" => platform::linux::wifi_password(iface, ssid).await,
        "macos" => platform::macos::wifi_password(ssid).await,
        "windows" => platform::windows::wifi_password(ssid).await,
        _ => None,
    }
}

/// Map an OS-reported security string onto the QR spec's encryption token. The
/// spec knows only `WPA`, `WEP` and `nopass`; WPA2/WPA3/RSN/802.1X all share the
/// `WPA` token, which is what phones expect. An unrecognised-but-present value
/// is treated as `WPA`, the near-universal default, rather than as open.
fn encryption_token(security: Option<&str>) -> String {
    let Some(raw) = security else {
        return "nopass".into();
    };
    let s = raw.to_uppercase();
    let s = s.trim();
    if s.is_empty() || s == "--" || s == "NONE" || s == "OPEN" {
        "nopass".into()
    } else if s.contains("WEP") {
        "WEP".into()
    } else {
        // WPA / WPA2 / WPA3 / RSN / PSK / 802.1X and anything else non-empty.
        "WPA".into()
    }
}

/// Escape a value for a `WIFI:` URI field. Per the de-facto MECARD-style spec,
/// backslash, semicolon, comma, colon and double-quote are special and each is
/// prefixed with a backslash.
fn escape_wifi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        if matches!(c, '\\' | ';' | ',' | ':' | '"') {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

/// The `WIFI:` join URI. Open networks omit the password field entirely; secured
/// networks always include it (empty when we couldn't read the secret, which
/// scanners treat as "prompt me").
fn build_wifi_uri(ssid: &str, encryption: &str, password: Option<&str>) -> String {
    let s = escape_wifi(ssid);
    if encryption == "nopass" {
        format!("WIFI:T:nopass;S:{s};;")
    } else {
        let p = password.map(escape_wifi).unwrap_or_default();
        format!("WIFI:T:{encryption};S:{s};P:{p};;")
    }
}

/// Render `data` as an SVG QR code (one 1×1 rect per dark module, on a white
/// field with the spec's 4-module quiet zone). Self-contained markup so the
/// frontend can inline it as a data URI without any client-side QR library.
fn qr_svg(data: &str) -> Result<String, String> {
    use qrcode::{Color, EcLevel, QrCode};

    // Medium error correction: comfortably scannable while keeping the symbol
    // small enough to stay crisp in the dialog.
    let code = QrCode::with_error_correction_level(data.as_bytes(), EcLevel::M)
        .map_err(|e| format!("Could not encode the Wi-Fi QR code: {e}"))?;
    let width = code.width();
    let colors = code.to_colors();

    const QUIET: usize = 4;
    let dim = width + QUIET * 2;

    let mut rects = String::new();
    for y in 0..width {
        for x in 0..width {
            if colors[y * width + x] == Color::Dark {
                let px = x + QUIET;
                let py = y + QUIET;
                rects.push_str(&format!(
                    "<rect x=\"{px}\" y=\"{py}\" width=\"1\" height=\"1\"/>"
                ));
            }
        }
    }

    Ok(format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 {dim} {dim}\" \
         shape-rendering=\"crispEdges\">\
         <rect width=\"{dim}\" height=\"{dim}\" fill=\"#ffffff\"/>\
         <g fill=\"#000000\">{rects}</g></svg>"
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encryption_token_maps_common_security_strings() {
        assert_eq!(encryption_token(None), "nopass");
        assert_eq!(encryption_token(Some("")), "nopass");
        assert_eq!(encryption_token(Some("--")), "nopass");
        assert_eq!(encryption_token(Some("Open")), "nopass");
        assert_eq!(encryption_token(Some("WPA2")), "WPA");
        assert_eq!(encryption_token(Some("WPA3")), "WPA");
        assert_eq!(encryption_token(Some("WPA2 WPA3")), "WPA");
        assert_eq!(encryption_token(Some("RSN")), "WPA");
        assert_eq!(encryption_token(Some("WEP")), "WEP");
    }

    #[test]
    fn escape_wifi_backslash_escapes_the_special_characters() {
        assert_eq!(escape_wifi("Cafe;Bar"), "Cafe\\;Bar");
        assert_eq!(escape_wifi(r"a\b"), r"a\\b");
        assert_eq!(escape_wifi("a:b,c\"d"), "a\\:b\\,c\\\"d");
        assert_eq!(escape_wifi("Plain SSID"), "Plain SSID");
    }

    #[test]
    fn build_wifi_uri_shapes_open_and_secured_networks() {
        assert_eq!(build_wifi_uri("Net", "nopass", None), "WIFI:T:nopass;S:Net;;");
        assert_eq!(
            build_wifi_uri("Net", "WPA", Some("p@ss")),
            "WIFI:T:WPA;S:Net;P:p@ss;;"
        );
        // Secured but secret unknown → empty password field, not a dropped one.
        assert_eq!(build_wifi_uri("Net", "WPA", None), "WIFI:T:WPA;S:Net;P:;;");
    }

    #[test]
    fn qr_svg_produces_scannable_self_contained_markup() {
        let svg = qr_svg("WIFI:T:WPA;S:Net;P:secret;;").expect("encodes");
        assert!(svg.starts_with("<svg"));
        assert!(svg.contains("viewBox"));
        assert!(svg.contains("<rect"));
    }
}
