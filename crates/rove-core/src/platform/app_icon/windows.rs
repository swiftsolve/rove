//! Windows app icons: the process's executable, then the Shell's icon for it via
//! `IShellItemImageFactory`, read back with GDI.
use base64::Engine as _;
use std::ffi::{OsStr, OsString};
use std::mem::size_of;
use std::os::windows::ffi::{OsStrExt, OsStringExt};
use std::path::{Path, PathBuf};
use windows::core::{PCWSTR, PWSTR};
use windows::Win32::Foundation::{CloseHandle, SIZE};
use windows::Win32::Graphics::Gdi::{
    DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
    DIB_RGB_COLORS, HGDIOBJ,
};
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Shell::{
    IShellItemImageFactory, SHCreateItemFromParsingName, SIIGBF_BIGGERSIZEOK, SIIGBF_ICONONLY,
};

/// Edge of the rasterised icon in pixels, as on macOS. `.exe` icons go up to
/// 256px; 64 keeps each `data:` URI to a few KB over IPC and is still crisp
/// in a 16-24px box on high-DPI screens.
const ICON_PX: i32 = 64;

/// A `data:image/png;base64,…` icon for the app that owns `pid` (preferred),
/// or for a live process matching `name` (fallback), or `None` when neither
/// resolves to a readable executable icon.
pub fn app_icon_data_uri(name: &str, pid: Option<u32>) -> Option<String> {
    let path = pid.and_then(exe_path_for_pid).or_else(|| exe_path_for_name(name))?;
    let (rgba, w, h) = rasterize_icon(&path)?;
    // Trim the transparent margin each `.exe` bakes in, so icons with very
    // different padding (Edge and Notion pad heavily, node and svchost are
    // edge to edge) fill their tile alike. Untrimmed if nothing is visible.
    match trim_to_content_square(&rgba, w, h) {
        Some((cropped, side)) => encode_png_data_uri(&cropped, side, side),
        None => encode_png_data_uri(&rgba, w, h),
    }
}

/// The image path of the process with this pid, via
/// `QueryFullProcessImageNameW`. `None` if the pid has exited (which
/// [`exe_path_for_name`] covers) or can't be opened, such as a protected
/// process.
pub(crate) fn exe_path_for_pid(pid: u32) -> Option<PathBuf> {
    // SAFETY: a scoped process handle, closed on every path out; the path
    // buffer is sized up front and the OS writes back the used length.
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        // Long paths can exceed MAX_PATH (260); 1024 covers any real install
        // location without a resize round-trip.
        let mut buf = vec![0u16; 1024];
        let mut len = buf.len() as u32;
        let query = QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len);
        let _ = CloseHandle(handle);
        query.ok()?;
        Some(PathBuf::from(OsString::from_wide(&buf[..len as usize])))
    }
}

/// The executable of the first live process whose image name is `name`,
/// ignoring case (e.g. "claude.exe"). For when the pid that moved the bytes
/// has exited but another instance or same-named helper still runs, as is
/// usual for browsers and Electron apps.
fn exe_path_for_name(name: &str) -> Option<PathBuf> {
    // SAFETY: a scoped snapshot handle, closed on every path out; the entry is
    // fully initialised with its required `dwSize` before the first read.
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).ok()?;
        let mut entry = PROCESSENTRY32W { dwSize: size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
        let mut pid: Option<u32> = None;
        if Process32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                if wide_nul_to_string(&entry.szExeFile).eq_ignore_ascii_case(name) {
                    pid = Some(entry.th32ProcessID);
                    break;
                }
                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snapshot);
        pid.and_then(exe_path_for_pid)
    }
}

/// Ask the Shell for `path`'s icon at [`ICON_PX`]² and read it back as
/// straight-alpha RGBA. Returns the pixels with the width/height GDI actually
/// produced (`SIIGBF_BIGGERSIZEOK` lets it hand back a larger native size,
/// which the frontend's `<img>` scales down cleanly).
fn rasterize_icon(path: &Path) -> Option<(Vec<u8>, i32, i32)> {
    // SAFETY: COM is initialised for the duration of the call via `ComGuard`;
    // the shell item and bitmap are created, used, and freed within this scope
    // before the guard uninitialises COM on drop.
    unsafe {
        let _com = ComGuard::new();
        let wide = to_wide(path.as_os_str());
        let factory: IShellItemImageFactory = SHCreateItemFromParsingName(PCWSTR(wide.as_ptr()), None).ok()?;
        let size = SIZE { cx: ICON_PX, cy: ICON_PX };
        let bitmap = factory.GetImage(size, SIIGBF_ICONONLY | SIIGBF_BIGGERSIZEOK).ok()?;
        let pixels = bitmap_to_rgba(bitmap);
        let _ = DeleteObject(HGDIOBJ(bitmap.0));
        pixels
    }
}

/// Copy a 32-bpp `HBITMAP`'s pixels into a straight-alpha RGBA buffer.
///
/// `IShellItemImageFactory` returns premultiplied BGRA; PNG wants straight
/// RGBA, so each channel is divided by its alpha. Some icons come back with
/// an all-zero alpha plane, meaning no transparency data rather than fully
/// transparent; those are drawn opaque, or the whole icon would vanish.
unsafe fn bitmap_to_rgba(bitmap: windows::Win32::Graphics::Gdi::HBITMAP) -> Option<(Vec<u8>, i32, i32)> {
    let mut info = BITMAP::default();
    let read =
        GetObjectW(HGDIOBJ(bitmap.0), size_of::<BITMAP>() as i32, Some(&mut info as *mut _ as *mut core::ffi::c_void));
    if read == 0 {
        return None;
    }
    let (w, h) = (info.bmWidth, info.bmHeight);
    if w <= 0 || h <= 0 {
        return None;
    }

    // Negative height requests a top-down DIB so row 0 is the top row.
    let mut bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: w,
            biHeight: -h,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    };
    let mut buf = vec![0u8; (w as usize) * (h as usize) * 4];

    let hdc = GetDC(None);
    let lines =
        GetDIBits(hdc, bitmap, 0, h as u32, Some(buf.as_mut_ptr() as *mut core::ffi::c_void), &mut bmi, DIB_RGB_COLORS);
    ReleaseDC(None, hdc);
    if lines == 0 {
        return None;
    }

    let has_alpha = buf.as_chunks::<4>().0.iter().any(|px| px[3] != 0);
    for px in buf.as_chunks_mut::<4>().0 {
        let (b, g, r, a) = (px[0], px[1], px[2], px[3]);
        if !has_alpha {
            // No alpha channel supplied: keep the colour, force opaque.
            (px[0], px[1], px[2], px[3]) = (r, g, b, 255);
        } else if a == 0 {
            (px[0], px[1], px[2], px[3]) = (0, 0, 0, 0);
        } else {
            (px[0], px[1], px[2], px[3]) = (unpremultiply(r, a), unpremultiply(g, a), unpremultiply(b, a), a);
        }
    }
    Some((buf, w, h))
}

/// Recover a straight-alpha channel value from its premultiplied form,
/// clamped in case rounding pushes it past 255.
fn unpremultiply(channel: u8, alpha: u8) -> u8 {
    ((channel as u32 * 255) / alpha as u32).min(255) as u8
}

/// Crop `rgba` (`w`×`h`, straight alpha) to a centred square around its
/// visible pixels plus a small uniform margin. An `.exe` icon's canvas has
/// whatever padding its designer chose, and the UI's `object-fit: contain`
/// scales the whole canvas into the tile, so a padded glyph looks small next
/// to an edge-to-edge one. Cropping to the glyph removes that difference.
///
/// Square and centred, so the aspect ratio is kept. `None` when nothing is
/// visible: a fully transparent bitmap to encode as is.
fn trim_to_content_square(rgba: &[u8], w: i32, h: i32) -> Option<(Vec<u8>, i32)> {
    // Ignore near-transparent anti-aliasing fringe so a faint halo doesn't
    // defeat the trim by pinning the bounds to the full canvas.
    const ALPHA_THRESHOLD: u8 = 12;

    let (w, h) = (w as usize, h as usize);
    if w == 0 || h == 0 || rgba.len() < w * h * 4 {
        return None;
    }

    let (mut min_x, mut min_y, mut max_x, mut max_y) = (w, h, 0usize, 0usize);
    let mut any = false;
    for y in 0..h {
        for x in 0..w {
            if rgba[(y * w + x) * 4 + 3] > ALPHA_THRESHOLD {
                any = true;
                min_x = min_x.min(x);
                min_y = min_y.min(y);
                max_x = max_x.max(x);
                max_y = max_y.max(y);
            }
        }
    }
    if !any {
        return None;
    }

    // Square side = the longer content dimension, grown ~11% (÷0.9) so the
    // glyph doesn't sit flush against the tile edge. Never below the content.
    let content_side = (max_x - min_x + 1).max(max_y - min_y + 1);
    let side = (((content_side as f64) / 0.90).round() as usize).max(content_side);

    // Top-left of the square, centred on the content box. Signed so the margin
    // can overhang the source edge (when the glyph reaches it); overhang is
    // filled with transparent pixels, keeping the glyph centred.
    let center_x = (min_x + max_x + 1) as f64 / 2.0;
    let center_y = (min_y + max_y + 1) as f64 / 2.0;
    let start_x = (center_x - side as f64 / 2.0).round() as i64;
    let start_y = (center_y - side as f64 / 2.0).round() as i64;

    let mut out = vec![0u8; side * side * 4];
    for oy in 0..side {
        let sy = start_y + oy as i64;
        if sy < 0 || sy as usize >= h {
            continue;
        }
        for ox in 0..side {
            let sx = start_x + ox as i64;
            if sx < 0 || sx as usize >= w {
                continue;
            }
            let src = ((sy as usize) * w + sx as usize) * 4;
            let dst = (oy * side + ox) * 4;
            out[dst..dst + 4].copy_from_slice(&rgba[src..src + 4]);
        }
    }
    Some((out, side as i32))
}

/// Encode a straight-alpha RGBA buffer as a base64 PNG `data:` URI.
fn encode_png_data_uri(rgba: &[u8], w: i32, h: i32) -> Option<String> {
    let mut png_bytes: Vec<u8> = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut png_bytes, w as u32, h as u32);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().ok()?;
        writer.write_image_data(rgba).ok()?;
    }
    if png_bytes.is_empty() {
        return None;
    }
    let b64 = base64::engine::general_purpose::STANDARD.encode(&png_bytes);
    Some(format!("data:image/png;base64,{b64}"))
}

/// Initialises COM for the current thread, which the Shell item factory
/// needs, and balances it on drop. Every successful `CoInitializeEx`,
/// `S_FALSE` ("already initialised") included, needs a `CoUninitialize`; a
/// `RPC_E_CHANGED_MODE` failure must not get one.
struct ComGuard {
    owned: bool,
}

impl ComGuard {
    unsafe fn new() -> Self {
        let hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        ComGuard { owned: hr.is_ok() }
    }
}

impl Drop for ComGuard {
    fn drop(&mut self) {
        if self.owned {
            // SAFETY: balances the `CoInitializeEx` this guard performed.
            unsafe { CoUninitialize() };
        }
    }
}

/// A NUL-terminated wide string for a Win32 `PCWSTR` argument.
fn to_wide(s: &OsStr) -> Vec<u16> {
    s.encode_wide().chain(std::iter::once(0)).collect()
}

/// Decode a fixed-size, NUL-terminated wide buffer (e.g. `szExeFile`) to a
/// `String`, stopping at the first NUL.
fn wide_nul_to_string(buf: &[u16]) -> String {
    let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..end])
}

#[cfg(test)]
mod trim_tests {
    use super::trim_to_content_square;

    /// A `w`×`h` RGBA buffer, transparent but for a solid white rectangle
    /// `[x0,x1)`×`[y0,y1)`.
    fn canvas(w: usize, h: usize, x0: usize, y0: usize, x1: usize, y1: usize) -> Vec<u8> {
        let mut buf = vec![0u8; w * h * 4];
        for y in y0..y1 {
            for x in x0..x1 {
                let i = (y * w + x) * 4;
                buf[i..i + 4].copy_from_slice(&[255, 255, 255, 255]);
            }
        }
        buf
    }

    /// A small glyph in a large transparent canvas is cropped to a tight,
    /// centred square.
    #[test]
    fn crops_away_transparent_padding() {
        // 20px block centred in a 100px canvas.
        let buf = canvas(100, 100, 40, 40, 60, 60);
        let (out, side) = trim_to_content_square(&buf, 100, 100).unwrap();
        // Content is 20px; the square is that plus the ~11% margin (÷0.9 → 22),
        // nowhere near the original 100.
        assert!((22..=24).contains(&side), "side {side} isn't tight around 20px content");
        assert_eq!(out.len(), (side as usize).pow(2) * 4);
        // Centre lands on the glyph (opaque); a corner is the added margin
        // (transparent).
        let mid = ((side as usize / 2) * side as usize + side as usize / 2) * 4;
        assert_eq!(out[mid + 3], 255, "glyph should sit at the centre");
        assert_eq!(out[3], 0, "corner should be transparent margin");
    }

    /// A near-transparent haze below the alpha threshold doesn't pin the
    /// bounds to the full canvas; only the solid core is bounded.
    #[test]
    fn ignores_faint_antialias_fringe() {
        let mut buf = vec![0u8; 40 * 40 * 4];
        for px in buf.as_chunks_mut::<4>().0 {
            px[3] = 8; // below ALPHA_THRESHOLD
        }
        for y in 15..25 {
            for x in 15..25 {
                let i = (y * 40 + x) * 4;
                buf[i..i + 4].copy_from_slice(&[255, 255, 255, 255]);
            }
        }
        let (_, side) = trim_to_content_square(&buf, 40, 40).unwrap();
        assert!(side < 20, "fringe defeated the trim (side {side})");
    }

    /// A fully transparent bitmap has nothing to bound, so the caller is told
    /// to encode it untouched rather than crop to an empty square.
    #[test]
    fn fully_transparent_bitmap_is_not_cropped() {
        assert!(trim_to_content_square(&vec![0u8; 8 * 8 * 4], 8, 8).is_none());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The Shell returns at least a generic application icon for any real `.exe`,
    /// so resolving the test runner's own process exercises the whole
    /// pid→path→bitmap→PNG pipeline and must yield a valid PNG `data:` URI.
    #[test]
    fn resolves_the_current_process_icon_as_a_png_data_uri() {
        let uri =
            app_icon_data_uri("", Some(std::process::id())).expect("the current process should resolve to an icon");
        assert!(uri.starts_with("data:image/png;base64,"), "not a PNG data URI: {uri:.40}");
        // A 64px RGBA icon is far larger than a few dozen base64 characters; this
        // guards against an empty/degenerate encode slipping through as `Some`.
        assert!(uri.len() > 100, "unexpectedly tiny PNG data URI ({} chars)", uri.len());
    }

    /// A pid that isn't live and a name that matches no running process resolve
    /// to nothing, so the UI keeps its favicon/monogram fallback rather than a
    /// broken image.
    #[test]
    fn unresolvable_process_yields_none() {
        assert!(
            app_icon_data_uri("rove-no-such-process.exe", Some(u32::MAX)).is_none(),
            "a dead pid and unknown name should resolve to no icon"
        );
    }
}
