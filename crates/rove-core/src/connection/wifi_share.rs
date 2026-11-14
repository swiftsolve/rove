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

/// Why there's no Wi-Fi to share. The text is what the share dialog shows.
#[derive(Debug, thiserror::Error)]
pub enum WifiShareError {
    #[error("Not connected to Wi-Fi.")]
    NotOnWifi,
    /// Usually macOS withholding the SSID without Location Services, but that
    /// isn't certain, so the message doesn't say so.
    #[error("Wi-Fi network name is unavailable.")]
    NetworkNameUnavailable,
    #[error("Could not encode the Wi-Fi QR code: {0}")]
    QrEncoding(#[from] qrcode::types::QrError),
}

/// The share payload for the active Wi-Fi network. Errs when there's no Wi-Fi
/// link or no SSID, as there's nothing to share.
pub async fn current_wifi_share() -> Result<WifiShare, WifiShareError> {
    let info = network_info().await;
    if info.connection_type != "wifi" {
        return Err(WifiShareError::NotOnWifi);
    }

    let ssid = info.details.ssid.clone().filter(|s| !s.is_empty()).ok_or(WifiShareError::NetworkNameUnavailable)?;

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

/// The share dialog's round tile behind the Rove mark, as a share of the code's
/// full width: `WifiQrCode`'s 36px circle on its 240px image.
const MARK_TILE_SHARE: f32 = 36.0 / 240.0;
/// Dots a little under a module wide, so neighbours stay apart.
const DOT_RADIUS: f32 = 0.42;

/// `data` as a self-contained SVG QR code (a dot per dark module, the corner
/// finders and the alignment patterns as rounded squares, white field, the
/// spec's 4-module quiet zone), so the frontend inlines it as a data URI with
/// no QR library.
fn qr_svg(data: &str) -> Result<String, qrcode::types::QrError> {
    use qrcode::{Color, EcLevel, QrCode};

    // High error correction: the dialog covers the code's centre with the Rove
    // mark, and H recovers up to 30% of it, far more than the mark hides.
    let code = QrCode::with_error_correction_level(data.as_bytes(), EcLevel::H)?;
    let width = code.width();
    let colors = code.to_colors();
    let is_dark = |x: usize, y: usize| colors[y * width + x] == Color::Dark;

    const QUIET: usize = 4;
    // A finder is 7x7 modules, in three corners.
    const FINDER: usize = 7;
    let dim = width + QUIET * 2;
    // Modules an eye draws whole, so the dots skip them.
    let mut is_drawn = vec![false; width * width];
    let mut shapes = String::new();

    for (fx, fy) in [(0, 0), (width - FINDER, 0), (0, width - FINDER)] {
        shapes.push_str(&eye_svg(fx + QUIET, fy + QUIET, FINDER));
        mark_drawn(&mut is_drawn, width, fx, fy, FINDER);
    }
    // An alignment pattern: a 5x5 functional block, a dark ring and centre
    // round a light ring. Drawn whole, as dots break up the ring a scanner
    // measures.
    for y in 2..width - 2 {
        for x in 2..width - 2 {
            let is_alignment = !is_drawn[y * width + x]
                && (y - 2..=y + 2).all(|ny| {
                    (x - 2..=x + 2).all(|nx| {
                        let ring = nx.abs_diff(x).max(ny.abs_diff(y));
                        code.is_functional(nx, ny) && !is_drawn[ny * width + nx] && is_dark(nx, ny) == (ring != 1)
                    })
                });
            if is_alignment {
                shapes.push_str(&eye_svg(x - 2 + QUIET, y - 2 + QUIET, 5));
                mark_drawn(&mut is_drawn, width, x - 2, y - 2, 5);
            }
        }
    }
    // The dialog's round tile over the centre, in modules. A dot it would cut
    // in half is left out, so the tile sits in a clean round gap.
    let middle = dim as f32 / 2.0;
    let clear = MARK_TILE_SHARE / 2.0 * dim as f32 + DOT_RADIUS;
    for y in 0..width {
        for x in 0..width {
            let (cx, cy) = ((x + QUIET) as f32 + 0.5, (y + QUIET) as f32 + 0.5);
            let is_under_mark = (cx - middle).hypot(cy - middle) < clear;
            if is_dark(x, y) && !is_drawn[y * width + x] && !is_under_mark {
                shapes.push_str(&format!("<circle cx=\"{cx}\" cy=\"{cy}\" r=\"{DOT_RADIUS}\"/>"));
            }
        }
    }

    Ok(format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 {dim} {dim}\">\
         <rect width=\"{dim}\" height=\"{dim}\" fill=\"#ffffff\"/>\
         <g fill=\"#000000\">{shapes}</g></svg>"
    ))
}

/// Flags the `size` x `size` modules from `(x, y)` as drawn.
fn mark_drawn(is_drawn: &mut [bool], width: usize, x: usize, y: usize, size: usize) {
    for row in y..y + size {
        is_drawn[row * width + x..row * width + x + size].fill(true);
    }
}

/// A finder (7) or alignment pattern (5) at module `(x, y)`, rounded: a ring
/// one module thick round a dark centre, the proportions a scanner locks onto.
fn eye_svg(x: usize, y: usize, size: usize) -> String {
    let outer = size as f32;
    let centre = outer - 4.0;
    format!(
        "<path fill-rule=\"evenodd\" d=\"{}{}\"/><rect x=\"{}\" y=\"{}\" width=\"{centre}\" height=\"{centre}\" rx=\"{}\"/>",
        rounded_square(x as f32, y as f32, outer, outer * 0.3),
        rounded_square(x as f32 + 1.0, y as f32 + 1.0, outer - 2.0, (outer - 2.0) * 0.2),
        x + 2,
        y + 2,
        centre * 0.3,
    )
}

/// A closed path of a `side`-wide square at `(x, y)` with corners of radius `r`.
fn rounded_square(x: f32, y: f32, side: f32, r: f32) -> String {
    let edge = side - 2.0 * r;
    format!(
        "M{},{y}h{edge}a{r},{r} 0 0 1 {r},{r}v{edge}a{r},{r} 0 0 1 -{r},{r}h-{edge}a{r},{r} 0 0 1 -{r},-{r}v-{edge}a{r},{r} 0 0 1 {r},-{r}z",
        x + r,
    )
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
    fn qr_svg_leaves_a_clean_gap_for_the_mark() {
        let svg = qr_svg("WIFI:T:WPA;S:Net;P:secret;;").expect("encodes");
        let dim: f32 = svg
            .split("viewBox=\"0 0 ")
            .nth(1)
            .and_then(|r| r.split(' ').next())
            .and_then(|n| n.parse().ok())
            .expect("viewBox");
        let clear = MARK_TILE_SHARE / 2.0 * dim + DOT_RADIUS;
        let dots: Vec<(f32, f32)> = svg
            .split("<circle cx=\"")
            .skip(1)
            .map(|rest| {
                let mut parts = rest.split('"');
                let cx: f32 = parts.next().and_then(|v| v.parse().ok()).expect("cx");
                let cy: f32 = parts.nth(1).and_then(|v| v.parse().ok()).expect("cy");
                (cx, cy)
            })
            .collect();
        assert!(!dots.is_empty());
        assert!(dots.iter().all(|(cx, cy)| (cx - dim / 2.0).hypot(cy - dim / 2.0) >= clear));
    }

    #[test]
    fn qr_svg_produces_scannable_self_contained_markup() {
        let svg = qr_svg("WIFI:T:WPA;S:Net;P:secret;;").expect("encodes");
        assert!(svg.starts_with("<svg"));
        assert!(svg.contains("viewBox"));
        assert!(svg.contains("<rect"));
    }
}
