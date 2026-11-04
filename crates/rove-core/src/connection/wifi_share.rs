//! The "join this Wi-Fi" payload for the current connection.
//!
//! SSID, encryption, the saved passphrase where the OS allows it, and a QR code
//! of the standard `WIFI:` URI that iOS and Android cameras offer to join.
//!
//! The passphrase is best effort. Every OS guards saved Wi-Fi secrets behind a
//! prompt (polkit on Linux, Keychain on macOS, Administrator elevation on
//! Windows). If the user declines or we lack the rights, it comes back `None`
//! and the QR carries the SSID only, so scanners pre-fill the name and ask for
//! the password.

use crate::connection::network_info;
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

/// The share payload for the active Wi-Fi network. Errs with a display string
/// when there's no Wi-Fi link or no SSID, as there's nothing to share.
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
        // Usually macOS withholding the SSID without Location Services, but that
        // isn't certain, so the message doesn't say so.
        .ok_or("Wi-Fi network name is unavailable.")?;

    let iface = info.interface_name.clone().unwrap_or_default();
    let encryption = encryption_token(info.details.security.as_deref());

    // Open networks have no secret; skip the lookup and the prompt it triggers.
    let password = if encryption == "nopass" { None } else { read_password(&iface, &ssid).await };

    let uri = build_wifi_uri(&ssid, &encryption, password.as_deref());
    let qr_svg = qr_svg(&uri)?;

    Ok(WifiShare { ssid, encryption, password, qr_svg })
}

/// Every platform module compiles everywhere, so pick by
/// `std::env::consts::OS`, as [`crate::connection::connection_details`] does.
async fn read_password(iface: &str, ssid: &str) -> Option<String> {
    match std::env::consts::OS {
        "linux" => platform::linux::wifi_password(iface, ssid).await,
        "macos" => platform::macos::wifi_password(ssid).await,
        "windows" => platform::windows::wifi_password(ssid).await,
        _ => None,
    }
}

/// Map an OS security string onto the QR spec's token. The spec knows only
/// `WPA`, `WEP` and `nopass`; WPA2, WPA3, RSN and 802.1X all share `WPA`, which
/// phones expect. An unrecognised but present value is `WPA`, the
/// near-universal default, rather than open.
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
        "WPA".into()
    }
}

/// Escape a `WIFI:` URI field. The de facto MECARD-style spec backslash-escapes
/// backslash, semicolon, comma, colon and double quote.
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

/// The `WIFI:` join URI. Open networks omit the password field; secured ones
/// always carry it, empty when the secret is unknown, which scanners read as
/// "ask the user".
fn build_wifi_uri(ssid: &str, encryption: &str, password: Option<&str>) -> String {
    let s = escape_wifi(ssid);
    if encryption == "nopass" {
        format!("WIFI:T:nopass;S:{s};;")
    } else {
        let p = password.map(escape_wifi).unwrap_or_default();
        format!("WIFI:T:{encryption};S:{s};P:{p};;")
    }
}

/// `data` as a self-contained SVG QR code (a 1x1 rect per dark module, white
/// field, the spec's 4-module quiet zone), so the frontend inlines it as a data
/// URI with no QR library.
fn qr_svg(data: &str) -> Result<String, String> {
    use qrcode::{Color, EcLevel, QrCode};

    // Medium error correction: reliably scannable, and small enough to stay
    // crisp in the dialog.
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
                rects.push_str(&format!("<rect x=\"{px}\" y=\"{py}\" width=\"1\" height=\"1\"/>"));
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
        assert_eq!(build_wifi_uri("Net", "WPA", Some("p@ss")), "WIFI:T:WPA;S:Net;P:p@ss;;");
        // Secured but secret unknown: an empty password field, not a dropped one.
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
