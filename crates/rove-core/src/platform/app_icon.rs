//! Real per-application icons on macOS, Windows and Linux.
//!
//! The usage views ([`crate::usage::app`], [`crate::usage::host`]) know only a
//! process name and pid. This resolves that to the icon the Dock, Finder or
//! Explorer would show, as a small PNG (or SVG) `data:` URI. The pid is tried
//! first, being the exact process that moved the bytes; the name catches a pid
//! that has exited by the time its icon is looked up.
//!
//!   * **macOS**: `NSRunningApplication(pid)`'s icon, gated on `bundleURL` so
//!     daemons don't get a generic placeholder, else
//!     `NSWorkspace.fullPathForApplication` by name via Launch Services.
//!   * **Windows**: the pid's (or a same-named live process's) executable, then
//!     the Shell's icon for it via `IShellItemImageFactory`: the same
//!     high-resolution icon Explorer draws, alpha included.
//!   * **Linux**: the pid's (or a same-named live process's) `.desktop` entry:
//!     its Flatpak app id or snap cgroup when sandboxed, else its executable or
//!     name against each entry's `Exec`, `StartupWMClass` and id. The entry's
//!     `Icon=` comes from the `hicolor` theme or `pixmaps` (or is a path), PNGs
//!     scaled down to 64px, SVGs passed through.
//!
//! Anything else (CLIs, system daemons, unknown names) gets `None` and the UI
//! shows a favicon or monogram. Other platforms always return `None`.

#[cfg(target_os = "macos")]
mod imp {
    use base64::Engine as _;
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2::AnyThread as _;
    use objc2_app_kit::{
        NSBitmapImageFileType, NSBitmapImageRep, NSBitmapImageRepPropertyKey, NSCalibratedRGBColorSpace,
        NSCompositingOperation, NSGraphicsContext, NSImage, NSRunningApplication, NSWorkspace,
    };
    use objc2_foundation::{NSDictionary, NSPoint, NSRect, NSSize, NSString};

    /// Edge of the rasterised icon in pixels. App icons ship at up to 1024px; 64
    /// keeps each `data:` URI to a few KB over IPC and is still crisp in a
    /// 16-24px box on high-DPI screens.
    const ICON_PX: isize = 64;

    /// A `data:image/png;base64,…` icon for the app that owns `pid` (preferred),
    /// or that `name` resolves to (fallback), or `None` when neither is an
    /// installed app.
    pub fn app_icon_data_uri(name: &str, pid: Option<u32>) -> Option<String> {
        let icon = pid.and_then(icon_via_pid).or_else(|| icon_via_name(name))?;
        render_png_data_uri(&icon)
    }

    /// The icon of the running app with this pid, only if it's a bundled `.app`
    /// (the `bundleURL` gate), so helper pids fall through to the name lookup
    /// instead of getting a generic executable icon.
    fn icon_via_pid(pid: u32) -> Option<Retained<NSImage>> {
        // Each accessor returns null when the pid isn't a bundled app, which the
        // `?` chain turns into `None`.
        let app = NSRunningApplication::runningApplicationWithProcessIdentifier(pid as i32)?;
        app.bundleURL()?;
        app.icon()
    }

    /// The icon of the installed app whose name matches `name`, via Launch
    /// Services. `fullPathForApplication` is case-insensitive and tolerant of the
    /// `.app` suffix, so a process name like "firefox" resolves to Firefox.app;
    /// unrecognised names (helpers spelled as bundle ids, CLIs) return `None`.
    fn icon_via_name(name: &str) -> Option<Retained<NSImage>> {
        // `fullPathForApplication` returns null for unknown names (→ `None`);
        // `iconForFile` always returns an image for a valid path.
        let workspace = NSWorkspace::sharedWorkspace();
        let ns_name = NSString::from_str(name);
        // Deprecated in favour of a bundle-id lookup we can't do from a bare
        // process name; it remains the only name→app path and still works.
        #[allow(deprecated)]
        let path = workspace.fullPathForApplication(&ns_name)?;
        Some(workspace.iconForFile(&path))
    }

    /// Draw `icon` into an offscreen [`ICON_PX`]² RGBA bitmap and return it as a
    /// PNG `data:` URI. Drawing, rather than reading a representation, gives the
    /// exact size whatever reps the icon ships.
    fn render_png_data_uri(icon: &NSImage) -> Option<String> {
        // SAFETY: an offscreen bitmap-backed graphics context; every call returns
        // null on failure (→ `None`) and none require the main thread.
        unsafe {
            let rep = NSBitmapImageRep::initWithBitmapDataPlanes_pixelsWide_pixelsHigh_bitsPerSample_samplesPerPixel_hasAlpha_isPlanar_colorSpaceName_bytesPerRow_bitsPerPixel(
                NSBitmapImageRep::alloc(),
                std::ptr::null_mut(), // planes: null → the rep allocates its own backing store
                ICON_PX,
                ICON_PX,
                8, // bits per sample
                4, // samples per pixel (RGBA)
                true,  // has alpha
                false, // not planar (interleaved)
                NSCalibratedRGBColorSpace,
                0, // bytes per row: 0 → derive from the params above
                0, // bits per pixel: 0 → derive (8 * 4)
            )?;

            // Route drawing into the bitmap by making it the current context, then
            // restore the previous context so we don't disturb any other drawing.
            let context = NSGraphicsContext::graphicsContextWithBitmapImageRep(&rep)?;
            NSGraphicsContext::saveGraphicsState_class();
            NSGraphicsContext::setCurrentContext(Some(&context));
            let dest = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(ICON_PX as f64, ICON_PX as f64));
            // A zero source rect means "the whole image", letting AppKit pick the
            // best representation for the destination size.
            let whole = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(0.0, 0.0));
            icon.drawInRect_fromRect_operation_fraction(dest, whole, NSCompositingOperation::SourceOver, 1.0);
            NSGraphicsContext::restoreGraphicsState_class();

            let props = NSDictionary::<NSBitmapImageRepPropertyKey, AnyObject>::new();
            let png = rep.representationUsingType_properties(NSBitmapImageFileType::PNG, &props)?;
            let bytes = png.to_vec();
            if bytes.is_empty() {
                return None;
            }
            let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
            Some(format!("data:image/png;base64,{b64}"))
        }
    }
}

#[cfg(target_os = "windows")]
mod imp {
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
        let read = GetObjectW(
            HGDIOBJ(bitmap.0),
            size_of::<BITMAP>() as i32,
            Some(&mut info as *mut _ as *mut core::ffi::c_void),
        );
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
                biCompression: BI_RGB.0 as u32,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut buf = vec![0u8; (w as usize) * (h as usize) * 4];

        let hdc = GetDC(None);
        let lines = GetDIBits(
            hdc,
            bitmap,
            0,
            h as u32,
            Some(buf.as_mut_ptr() as *mut core::ffi::c_void),
            &mut bmi,
            DIB_RGB_COLORS,
        );
        ReleaseDC(None, hdc);
        if lines == 0 {
            return None;
        }

        let has_alpha = buf.chunks_exact(4).any(|px| px[3] != 0);
        for px in buf.chunks_exact_mut(4) {
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
            for px in buf.chunks_exact_mut(4) {
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
}

#[cfg(target_os = "linux")]
mod imp {
    use base64::Engine as _;
    use std::collections::HashSet;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::{Arc, Mutex};
    use std::time::{Duration, Instant};

    /// Icon files bigger than this aren't read. PNGs are scaled down anyway, so
    /// this only drops the odd giant SVG with an embedded bitmap.
    const MAX_ICON_BYTES: u64 = 1024 * 1024;

    /// Edge length a PNG icon is scaled down to, matching the macOS and Windows
    /// paths: a few KB per icon over IPC, still crisp in a ~24px box on high DPI.
    const ICON_PX: u32 = 64;

    /// How long a scan of the `.desktop` files is reused. Long enough that a
    /// burst of new apps shares one scan, short enough to see an app installed
    /// while Rove runs.
    const INDEX_TTL: Duration = Duration::from_secs(300);

    /// The icon sizes to try, best first: 128px is crisp in a ~24px box on a
    /// high-DPI screen and still small, then the scalable SVG, then whatever
    /// else the theme has, nearest first.
    const ICON_SIZES: &[&str] = &["128x128", "scalable", "96x96", "256x256", "64x64", "512x512", "48x48", "32x32"];

    /// Launchers and interpreters an `Exec=` line can start with. Their name says
    /// nothing about the app, so matching on it would give every `python3` or
    /// `node` process the icon of whichever app happens to launch through one.
    const GENERIC_PROGRAMS: &[&str] = &[
        "sh", "bash", "env", "python", "python3", "java", "node", "electron", "wine", "flatpak", "snap", "gjs", "perl",
        "ruby",
    ];

    /// Directories shared by unrelated programs, where "same folder as the
    /// launcher" says nothing about which app a process belongs to.
    const SHARED_DIRS: &[&str] = &[
        "/bin",
        "/sbin",
        "/usr/bin",
        "/usr/sbin",
        "/usr/local/bin",
        "/usr/local/sbin",
        "/usr/lib",
        "/usr/lib64",
        "/usr/libexec",
        "/usr/lib/x86_64-linux-gnu",
        "/usr/lib/aarch64-linux-gnu",
        "/snap/bin",
        "/app/bin",
    ];

    /// The parts of an application `.desktop` entry the lookup uses.
    #[derive(Debug, Clone, PartialEq)]
    pub(super) struct DesktopEntry {
        /// The desktop file id, e.g. `com.anthropic.Claude` or `code_code`.
        pub id: String,
        /// `Icon=`: a theme icon name or an absolute path.
        pub icon: String,
        /// The program `Exec=` runs, with `env` and its assignments skipped.
        pub program: Option<String>,
        /// The app id of a `flatpak run` launcher.
        pub flatpak_id: Option<String>,
        pub try_exec: Option<String>,
        pub wm_class: Option<String>,
        pub is_hidden_from_menus: bool,
    }

    /// What's known about the process to find its entry for.
    #[derive(Debug, Default)]
    pub(super) struct ProcessFacts {
        /// Lowercased names it goes by: its `comm` and its executable's file name.
        pub names: Vec<String>,
        pub exe: Option<PathBuf>,
        pub flatpak_id: Option<String>,
        /// The `.desktop` id a snap app's entry has, `<snap>_<app>`.
        pub snap_desktop_id: Option<String>,
    }

    struct Index {
        built: Instant,
        entries: Arc<Vec<DesktopEntry>>,
    }

    static INDEX: Mutex<Option<Index>> = Mutex::new(None);

    /// A `data:` URI for the icon of the app that owns `pid` (preferred), or of
    /// a live process named `name` (fallback), from its `.desktop` entry and the
    /// icon theme. `None` for processes no installed app claims, such as CLIs
    /// and daemons.
    pub fn app_icon_data_uri(name: &str, pid: Option<u32>) -> Option<String> {
        let pid = pid.filter(|pid| Path::new(&format!("/proc/{pid}")).exists()).or_else(|| pid_for_name(name));
        let facts = process_facts(name, pid);
        let entries = desktop_entries();
        let entry = best_entry(&entries, &facts)?;
        let path = find_icon(&entry.icon, &icon_dirs())?;
        icon_data_uri(&path)
    }

    /// The pid of a live process whose `comm` is `name`, for when the process
    /// that moved the bytes has exited but a sibling of the same app is running.
    fn pid_for_name(name: &str) -> Option<u32> {
        if name.is_empty() {
            return None;
        }
        fs::read_dir("/proc").ok()?.flatten().find_map(|dir| {
            let pid: u32 = dir.file_name().to_str()?.parse().ok()?;
            let comm = fs::read_to_string(dir.path().join("comm")).ok()?;
            (comm.trim_end() == name).then_some(pid)
        })
    }

    fn process_facts(name: &str, pid: Option<u32>) -> ProcessFacts {
        let mut facts = ProcessFacts::default();
        push_name(&mut facts.names, name);
        let Some(pid) = pid else { return facts };
        let proc_dir = PathBuf::from(format!("/proc/{pid}"));

        facts.exe = fs::read_link(proc_dir.join("exe")).ok();
        if let Some(file_name) = facts.exe.as_deref().and_then(Path::file_name).and_then(|n| n.to_str()) {
            push_name(&mut facts.names, file_name);
        }
        // A Flatpak app's sandbox says which app it is.
        facts.flatpak_id =
            fs::read_to_string(proc_dir.join("root/.flatpak-info")).ok().and_then(|info| flatpak_info_name(&info));
        // A snap app runs in a `snap.<snap>.<app>…` cgroup. Other launchers'
        // `app-…` scopes aren't used: every child inherits them, so a command
        // run from a terminal would get the terminal's icon.
        facts.snap_desktop_id =
            fs::read_to_string(proc_dir.join("cgroup")).ok().and_then(|cgroup| snap_desktop_id(&cgroup));
        facts
    }

    fn push_name(names: &mut Vec<String>, name: &str) {
        let name = name.trim().to_lowercase();
        if !name.is_empty() && !names.contains(&name) {
            names.push(name);
        }
    }

    /// The app id in a `.flatpak-info` file: `name=` under `[Application]`.
    pub(super) fn flatpak_info_name(info: &str) -> Option<String> {
        let mut is_in_application = false;
        for line in info.lines().map(str::trim) {
            if line.starts_with('[') {
                is_in_application = line == "[Application]";
            } else if is_in_application {
                if let Some(name) = line.strip_prefix("name=") {
                    return Some(name.to_string());
                }
            }
        }
        None
    }

    /// `<snap>_<app>` from a cgroup path such as
    /// `0::/user.slice/…/snap.code.code-9287e34f.scope`.
    pub(super) fn snap_desktop_id(cgroup: &str) -> Option<String> {
        let unit = cgroup.split('/').find_map(|part| part.strip_prefix("snap."))?;
        let (snap, rest) = unit.split_once('.')?;
        let app = rest.split(['-', '.']).next().filter(|app| !app.is_empty())?;
        Some(format!("{snap}_{app}"))
    }

    /// The application entries on this machine, read at most every
    /// [`INDEX_TTL`]. An id found in an earlier data dir hides the same id in a
    /// later one, as the XDG spec has it.
    fn desktop_entries() -> Arc<Vec<DesktopEntry>> {
        let mut index = crate::util::net::lock(&INDEX);
        if let Some(index) = index.as_ref().filter(|index| index.built.elapsed() < INDEX_TTL) {
            return Arc::clone(&index.entries);
        }
        let entries = Arc::new(read_desktop_entries(&data_dirs()));
        *index = Some(Index { built: Instant::now(), entries: Arc::clone(&entries) });
        entries
    }

    pub(super) fn read_desktop_entries(data_dirs: &[PathBuf]) -> Vec<DesktopEntry> {
        let mut seen = HashSet::new();
        let mut entries = Vec::new();
        for dir in data_dirs {
            let Ok(files) = fs::read_dir(dir.join("applications")) else { continue };
            for file in files.flatten() {
                let path = file.path();
                let Some(id) = path.file_name().and_then(|n| n.to_str()).and_then(|n| n.strip_suffix(".desktop"))
                else {
                    continue;
                };
                if !seen.insert(id.to_string()) {
                    continue;
                }
                if let Some(entry) = fs::read_to_string(&path).ok().and_then(|text| parse_desktop_entry(id, &text)) {
                    entries.push(entry);
                }
            }
        }
        entries
    }

    /// `$XDG_DATA_HOME` then `$XDG_DATA_DIRS`, plus the Flatpak and snap export
    /// dirs in case the session's `XDG_DATA_DIRS` left them out.
    fn data_dirs() -> Vec<PathBuf> {
        let home = std::env::var_os("HOME").map(PathBuf::from);
        let mut dirs: Vec<PathBuf> = Vec::new();
        match std::env::var_os("XDG_DATA_HOME").filter(|v| !v.is_empty()) {
            Some(data_home) => dirs.push(data_home.into()),
            None => dirs.extend(home.as_ref().map(|home| home.join(".local/share"))),
        }
        let data_dirs = std::env::var("XDG_DATA_DIRS")
            .ok()
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| "/usr/local/share:/usr/share".into());
        dirs.extend(data_dirs.split(':').filter(|d| !d.is_empty()).map(PathBuf::from));
        dirs.extend(home.map(|home| home.join(".local/share/flatpak/exports/share")));
        dirs.push("/var/lib/flatpak/exports/share".into());
        dirs.push("/var/lib/snapd/desktop".into());

        let mut seen = HashSet::new();
        dirs.retain(|dir| seen.insert(dir.components().collect::<PathBuf>()));
        dirs
    }

    /// Parse the `[Desktop Entry]` group of a `.desktop` file. `None` for
    /// anything that isn't a visible application with an icon.
    pub(super) fn parse_desktop_entry(id: &str, text: &str) -> Option<DesktopEntry> {
        let mut is_in_entry = false;
        let (mut icon, mut exec, mut try_exec, mut wm_class) = (None, None, None, None);
        let (mut is_application, mut is_hidden, mut is_no_display) = (false, false, false);
        for line in text.lines().map(str::trim) {
            if line.starts_with('[') {
                is_in_entry = line == "[Desktop Entry]";
                continue;
            }
            if !is_in_entry {
                continue;
            }
            // Localised keys (`Icon[de]=`) don't match these exact names.
            let Some((key, value)) = line.split_once('=') else { continue };
            let value = value.trim().to_string();
            match key.trim() {
                "Type" => is_application = value == "Application",
                "Icon" => icon = Some(value),
                "Exec" => exec = Some(value),
                "TryExec" => try_exec = Some(value),
                "StartupWMClass" => wm_class = Some(value),
                "Hidden" => is_hidden = value == "true",
                "NoDisplay" => is_no_display = value == "true",
                _ => {}
            }
        }
        let icon = icon.filter(|icon| !icon.is_empty())?;
        if !is_application || is_hidden {
            return None;
        }
        let (program, flatpak_id) = exec.as_deref().map(parse_exec).unwrap_or_default();
        Some(DesktopEntry {
            id: id.to_string(),
            icon,
            program,
            flatpak_id,
            try_exec,
            wm_class,
            is_hidden_from_menus: is_no_display,
        })
    }

    /// The program an `Exec=` line runs, and the app id when it's a
    /// `flatpak run`. Skips a leading `env VAR=value …`; field codes (`%U`) and
    /// quoting are irrelevant to the first word.
    pub(super) fn parse_exec(exec: &str) -> (Option<String>, Option<String>) {
        let mut words = exec.split_whitespace().map(|word| word.trim_matches('"'));
        let mut program = words.next();
        if program.is_some_and(|p| base_name(p) == "env") {
            program = words.by_ref().find(|word| !word.contains('=') && !word.starts_with('-'));
        }
        let program = program.map(str::to_string);
        let flatpak_id = if program.as_deref().is_some_and(|p| base_name(p) == "flatpak") {
            let mut rest = words.skip_while(|word| *word != "run").skip(1);
            rest.find(|word| !word.starts_with('-')).map(str::to_string)
        } else {
            None
        };
        (program, flatpak_id)
    }

    fn base_name(path: &str) -> &str {
        path.rsplit('/').next().unwrap_or(path)
    }

    /// The entry that best claims this process, or `None` when none does.
    pub(super) fn best_entry<'a>(entries: &'a [DesktopEntry], facts: &ProcessFacts) -> Option<&'a DesktopEntry> {
        entries
            .iter()
            .filter_map(|entry| match_rank(entry, facts).map(|rank| (rank, entry)))
            // Lowest rank wins; then an entry shown in menus over a hidden helper
            // (such as a URL handler) for the same app.
            .min_by_key(|(rank, entry)| (*rank, entry.is_hidden_from_menus))
            .map(|(_, entry)| entry)
    }

    /// How surely `entry` is this process's app: 0 is certain, higher is a
    /// looser match, `None` is no match.
    fn match_rank(entry: &DesktopEntry, facts: &ProcessFacts) -> Option<u8> {
        let id = entry.id.to_lowercase();
        // The sandbox names the app outright.
        if facts.flatpak_id.as_deref().is_some_and(|app| app.eq_ignore_ascii_case(&entry.id))
            || facts.snap_desktop_id.as_deref().is_some_and(|snap| snap.eq_ignore_ascii_case(&entry.id))
        {
            return Some(0);
        }
        // A Flatpak process only ever belongs to its own app's entry.
        if facts.flatpak_id.is_some() {
            return None;
        }

        let program = entry.program.as_deref().filter(|p| !GENERIC_PROGRAMS.contains(&base_name(p)));
        let launcher = program.and_then(resolve_program);
        if let (Some(exe), Some(launcher)) = (facts.exe.as_deref(), launcher.as_deref()) {
            // The launcher is the executable (`/usr/bin/foo` → the same file).
            if launcher == exe {
                return Some(1);
            }
            // The launcher is a wrapper beside it (`/opt/google/chrome/google-chrome`
            // starting `/opt/google/chrome/chrome`).
            if let (Some(dir), Some(launcher_dir)) = (exe.parent(), launcher.parent()) {
                if dir == launcher_dir && !SHARED_DIRS.iter().any(|shared| dir == Path::new(shared)) {
                    return Some(2);
                }
            }
        }

        let keys: Vec<String> = [program, entry.try_exec.as_deref()]
            .into_iter()
            .flatten()
            .filter(|p| !GENERIC_PROGRAMS.contains(&base_name(p)))
            .map(|p| base_name(p).to_lowercase())
            .chain(entry.wm_class.iter().map(|class| class.to_lowercase()))
            .chain([id.clone()])
            .collect();
        if facts.names.iter().any(|name| keys.contains(name)) {
            return Some(3);
        }
        // Reverse-DNS ids name the app last: `org.gnome.Nautilus` ↔ `nautilus`.
        let id_tail = id.rsplit('.').next().unwrap_or(&id);
        facts.names.iter().any(|name| name == id_tail).then_some(4)
    }

    /// The file a launcher command runs, following symlinks, so it compares
    /// against `/proc/<pid>/exe` (which is always resolved).
    fn resolve_program(program: &str) -> Option<PathBuf> {
        let path = if program.contains('/') {
            PathBuf::from(program)
        } else {
            let search = std::env::var("PATH").unwrap_or_default();
            let found = search
                .split(':')
                .chain(["/usr/local/bin", "/usr/bin", "/bin"])
                .map(|dir| Path::new(dir).join(program))
                .find(|candidate| candidate.is_file());
            found?
        };
        fs::canonicalize(path).ok()
    }

    /// Where icon themes and pixmaps live, in lookup order.
    fn icon_dirs() -> Vec<PathBuf> {
        let mut dirs: Vec<PathBuf> = data_dirs().into_iter().map(|dir| dir.join("icons")).collect();
        dirs.extend(std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".icons")));
        dirs
    }

    /// The file for an `Icon=` value: an absolute path as is, otherwise the
    /// name in the `hicolor` theme (where apps install their icons) at the best
    /// size it has, then in `pixmaps`.
    pub(super) fn find_icon(icon: &str, icon_dirs: &[PathBuf]) -> Option<PathBuf> {
        let icon_path = Path::new(icon);
        if icon_path.is_absolute() {
            return icon_path.is_file().then(|| icon_path.to_path_buf());
        }
        // Some entries name the file rather than the icon.
        let name = icon.strip_suffix(".png").or_else(|| icon.strip_suffix(".svg")).unwrap_or(icon);
        for size in ICON_SIZES {
            for dir in icon_dirs {
                let apps = dir.join("hicolor").join(size).join("apps");
                for extension in ["png", "svg"] {
                    let candidate = apps.join(format!("{name}.{extension}"));
                    if candidate.is_file() {
                        return Some(candidate);
                    }
                }
            }
        }
        icon_dirs.iter().filter_map(|dir| dir.parent()).map(|share| share.join("pixmaps")).find_map(|pixmaps| {
            ["png", "svg"].iter().map(|extension| pixmaps.join(format!("{name}.{extension}"))).find(|p| p.is_file())
        })
    }

    /// The icon file as a `data:` URI. A PNG is scaled down to [`ICON_PX`] when
    /// it's bigger (snap icons are often 512px and a few hundred KB); an SVG
    /// goes as it is. Other formats (XPM) and oversized files are skipped.
    fn icon_data_uri(path: &Path) -> Option<String> {
        let extension = path.extension().and_then(|e| e.to_str())?;
        if !matches!(extension, "png" | "svg") || fs::metadata(path).ok()?.len() > MAX_ICON_BYTES {
            return None;
        }
        let bytes = fs::read(path).ok()?;
        if extension == "svg" {
            return Some(data_uri("image/svg+xml", &bytes));
        }
        let (rgba, w, h) = decode_png(&bytes)?;
        if w <= ICON_PX && h <= ICON_PX {
            return Some(data_uri("image/png", &bytes));
        }
        let (small, sw, sh) = downscale(&rgba, w, h, ICON_PX);
        encode_png(&small, sw, sh).map(|png| data_uri("image/png", &png))
    }

    fn data_uri(mime: &str, bytes: &[u8]) -> String {
        format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes))
    }

    /// Decode a PNG of any colour type to 8-bit straight-alpha RGBA.
    fn decode_png(bytes: &[u8]) -> Option<(Vec<u8>, u32, u32)> {
        let mut decoder = png::Decoder::new(std::io::Cursor::new(bytes));
        decoder.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
        let mut reader = decoder.read_info().ok()?;
        let mut buf = vec![0; reader.output_buffer_size()?];
        let frame = reader.next_frame(&mut buf).ok()?;
        let pixels = &buf[..frame.buffer_size()];
        let rgba = match frame.color_type {
            png::ColorType::Rgba => pixels.to_vec(),
            png::ColorType::Rgb => pixels.chunks_exact(3).flat_map(|p| [p[0], p[1], p[2], 255]).collect(),
            png::ColorType::GrayscaleAlpha => pixels.chunks_exact(2).flat_map(|p| [p[0], p[0], p[0], p[1]]).collect(),
            png::ColorType::Grayscale => pixels.iter().flat_map(|&g| [g, g, g, 255]).collect(),
            png::ColorType::Indexed => return None,
        };
        Some((rgba, frame.width, frame.height))
    }

    /// Shrink an RGBA image so its longer side is `side`, averaging each target
    /// pixel's source area. Colours are weighted by alpha so transparent pixels
    /// don't darken the edges.
    pub(super) fn downscale(rgba: &[u8], w: u32, h: u32, side: u32) -> (Vec<u8>, u32, u32) {
        let scale = side as f64 / w.max(h) as f64;
        let (tw, th) = (((w as f64 * scale).round() as u32).max(1), ((h as f64 * scale).round() as u32).max(1));
        let mut out = Vec::with_capacity((tw * th * 4) as usize);
        for ty in 0..th {
            let (y0, y1) = (ty * h / th, ((ty + 1) * h / th).max(ty * h / th + 1));
            for tx in 0..tw {
                let (x0, x1) = (tx * w / tw, ((tx + 1) * w / tw).max(tx * w / tw + 1));
                let mut sum = [0u64; 4];
                for y in y0..y1 {
                    for x in x0..x1 {
                        let i = ((y * w + x) * 4) as usize;
                        let alpha = rgba[i + 3] as u64;
                        for channel in 0..3 {
                            sum[channel] += rgba[i + channel] as u64 * alpha;
                        }
                        sum[3] += alpha;
                    }
                }
                let count = ((y1 - y0) * (x1 - x0)) as u64;
                let alpha = sum[3];
                for channel in sum.iter().take(3) {
                    out.push(channel.checked_div(alpha).unwrap_or(0) as u8);
                }
                out.push((alpha / count) as u8);
            }
        }
        (out, tw, th)
    }

    fn encode_png(rgba: &[u8], w: u32, h: u32) -> Option<Vec<u8>> {
        let mut png_bytes = Vec::new();
        let mut encoder = png::Encoder::new(&mut png_bytes, w, h);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        encoder.write_header().ok()?.write_image_data(rgba).ok()?;
        Some(png_bytes)
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
mod imp {
    /// No icon source on this platform; the UI shows a favicon or monogram.
    pub fn app_icon_data_uri(_name: &str, _pid: Option<u32>) -> Option<String> {
        None
    }
}

pub use imp::*;

#[cfg(all(test, target_os = "windows"))]
mod windows_tests {
    use super::app_icon_data_uri;

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

#[cfg(all(test, target_os = "linux"))]
mod linux_tests {
    use super::imp::*;
    use std::fs;
    use std::path::PathBuf;

    /// A fresh, empty directory under the system temp dir for one test.
    fn temp_dir(test: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("rove-app-icon-{test}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("create the test dir");
        dir
    }

    fn facts(names: &[&str]) -> ProcessFacts {
        ProcessFacts { names: names.iter().map(|n| n.to_string()).collect(), ..Default::default() }
    }

    fn entry(id: &str, text: &str) -> DesktopEntry {
        parse_desktop_entry(id, text).expect("a visible application entry")
    }

    #[test]
    fn parses_the_desktop_entry_group_only() {
        let parsed = entry(
            "com.anthropic.Claude",
            "[Desktop Entry]\nType=Application\nName=Claude\nExec=claude-desktop %U\nIcon=claude-desktop\nIcon[de]=other\nStartupWMClass=com.anthropic.Claude\n\n[Desktop Action new-window]\nExec=elsewhere\nIcon=elsewhere\n",
        );
        assert_eq!(parsed.icon, "claude-desktop");
        assert_eq!(parsed.program.as_deref(), Some("claude-desktop"));
        assert_eq!(parsed.wm_class.as_deref(), Some("com.anthropic.Claude"));
        assert!(!parsed.is_hidden_from_menus);
    }

    #[test]
    fn skips_hidden_iconless_and_non_application_entries() {
        assert!(parse_desktop_entry("a", "[Desktop Entry]\nType=Application\nExec=a\nIcon=a\nHidden=true").is_none());
        assert!(parse_desktop_entry("b", "[Desktop Entry]\nType=Application\nExec=b").is_none());
        assert!(parse_desktop_entry("c", "[Desktop Entry]\nType=Link\nURL=x\nIcon=c").is_none());
        // NoDisplay entries stay: a URL handler can still be the only match.
        assert!(entry("d", "[Desktop Entry]\nType=Application\nExec=d\nIcon=d\nNoDisplay=true").is_hidden_from_menus);
    }

    #[test]
    fn reads_the_program_behind_env_and_the_flatpak_app_id() {
        assert_eq!(parse_exec("env FOO=1 BAR=2 /opt/app/run --flag %U"), (Some("/opt/app/run".into()), None));
        assert_eq!(
            parse_exec("/usr/bin/flatpak run --branch=stable --arch=x86_64 --command=obs com.obsproject.Studio"),
            (Some("/usr/bin/flatpak".into()), Some("com.obsproject.Studio".into()))
        );
    }

    #[test]
    fn reads_the_sandboxed_app_from_flatpak_info_and_snap_cgroups() {
        assert_eq!(
            flatpak_info_name("[Application]\nname=com.obsproject.Studio\nruntime=x\n\n[Instance]\nname=other")
                .as_deref(),
            Some("com.obsproject.Studio")
        );
        assert_eq!(
            snap_desktop_id(
                "0::/user.slice/user-1000.slice/user@1000.service/app.slice/snap.code.code-9287e34f.scope\n"
            )
            .as_deref(),
            Some("code_code")
        );
        assert_eq!(snap_desktop_id("0::/user.slice/app-gnome-org.gnome.Terminal-1.scope"), None);
    }

    #[test]
    fn matches_a_process_by_program_wm_class_or_id() {
        let entries = vec![
            entry("org.gnome.Nautilus", "[Desktop Entry]\nType=Application\nExec=nautilus --new-window\nIcon=nautilus"),
            entry("spotify", "[Desktop Entry]\nType=Application\nExec=/usr/bin/run-spotify\nIcon=spotify-client\nStartupWMClass=Spotify"),
            entry("com.anthropic.Claude", "[Desktop Entry]\nType=Application\nExec=claude-desktop %U\nIcon=claude-desktop"),
        ];
        let icon = |names: &[&str]| best_entry(&entries, &facts(names)).map(|e| e.icon.as_str());
        assert_eq!(icon(&["nautilus"]), Some("nautilus"));
        assert_eq!(icon(&["spotify"]), Some("spotify-client"));
        assert_eq!(icon(&["claude-desktop"]), Some("claude-desktop"));
        assert_eq!(icon(&["curl"]), None);
    }

    #[test]
    fn prefers_the_menu_entry_over_a_hidden_helper() {
        let entries = vec![
            entry(
                "code-url-handler",
                "[Desktop Entry]\nType=Application\nExec=code --open-url %U\nIcon=handler\nNoDisplay=true",
            ),
            entry("code", "[Desktop Entry]\nType=Application\nExec=code %F\nIcon=vscode"),
        ];
        assert_eq!(best_entry(&entries, &facts(&["code"])).map(|e| e.icon.as_str()), Some("vscode"));
    }

    #[test]
    fn ignores_generic_launchers_and_keeps_flatpaks_to_their_own_entry() {
        let entries = vec![
            entry("some-electron-app", "[Desktop Entry]\nType=Application\nExec=node /opt/app/main.js\nIcon=app"),
            entry("com.obsproject.Studio", "[Desktop Entry]\nType=Application\nExec=/usr/bin/flatpak run com.obsproject.Studio\nIcon=com.obsproject.Studio\nStartupWMClass=obs"),
            entry("obs-native", "[Desktop Entry]\nType=Application\nExec=obs\nIcon=wrong"),
        ];
        assert!(best_entry(&entries, &facts(&["node"])).is_none(), "node isn't the Electron app");
        let obs = ProcessFacts { flatpak_id: Some("com.obsproject.Studio".into()), ..facts(&["obs"]) };
        assert_eq!(best_entry(&entries, &obs).map(|e| e.icon.as_str()), Some("com.obsproject.Studio"));
    }

    #[test]
    fn matches_a_snap_app_by_its_cgroup() {
        let entries = vec![entry(
            "chromium_chromium",
            "[Desktop Entry]\nType=Application\nExec=/snap/bin/chromium %U\nIcon=/snap/chromium/current/chromium.png",
        )];
        let chrome = ProcessFacts { snap_desktop_id: Some("chromium_chromium".into()), ..facts(&["chrome"]) };
        assert!(best_entry(&entries, &chrome).is_some());
        assert!(best_entry(&entries, &facts(&["chrome"])).is_none());
    }

    #[test]
    fn matches_an_executable_beside_its_launcher_script() {
        let dir = temp_dir("launcher");
        let app_dir = dir.join("opt/browser");
        fs::create_dir_all(&app_dir).unwrap();
        fs::write(app_dir.join("browser-launcher"), "#!/bin/sh").unwrap();
        fs::write(app_dir.join("engine"), "").unwrap();
        let exec =
            format!("[Desktop Entry]\nType=Application\nExec={}/browser-launcher\nIcon=browser", app_dir.display());
        let entries = vec![entry("browser", &exec)];
        let engine =
            ProcessFacts { exe: Some(fs::canonicalize(app_dir.join("engine")).unwrap()), ..facts(&["engine"]) };
        assert_eq!(best_entry(&entries, &engine).map(|e| e.icon.as_str()), Some("browser"));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn reads_entries_with_earlier_data_dirs_winning() {
        let dir = temp_dir("entries");
        let (home, system) = (dir.join("home"), dir.join("system"));
        for (root, icon) in [(&home, "mine"), (&system, "theirs")] {
            fs::create_dir_all(root.join("applications")).unwrap();
            fs::write(
                root.join("applications/app.desktop"),
                format!("[Desktop Entry]\nType=Application\nExec=app\nIcon={icon}"),
            )
            .unwrap();
        }
        let entries = read_desktop_entries(&[home, system]);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].icon, "mine");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn downscales_by_averaging_without_darkening_transparent_edges() {
        // 4x2: a red half and a fully transparent half, scaled to 2x1.
        let mut rgba = Vec::new();
        for _ in 0..2 {
            rgba.extend([255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0]);
        }
        let (out, w, h) = downscale(&rgba, 4, 2, 2);
        assert_eq!((w, h), (2, 1));
        assert_eq!(out, vec![255, 0, 0, 255, 0, 0, 0, 0]);
        // A half-covered pixel keeps its colour at half alpha, not a darker red.
        let (out, _, _) = downscale(&[255, 0, 0, 255, 0, 0, 0, 0], 2, 1, 1);
        assert_eq!(out, vec![255, 0, 0, 127]);
    }

    #[test]
    fn finds_the_best_sized_theme_icon_then_pixmaps() {
        let dir = temp_dir("icons");
        let icons = dir.join("share/icons");
        for size in ["48x48", "128x128"] {
            fs::create_dir_all(icons.join(format!("hicolor/{size}/apps"))).unwrap();
            fs::write(icons.join(format!("hicolor/{size}/apps/app.png")), "png").unwrap();
        }
        fs::create_dir_all(icons.join("hicolor/scalable/apps")).unwrap();
        fs::write(icons.join("hicolor/scalable/apps/vector.svg"), "<svg/>").unwrap();
        fs::create_dir_all(dir.join("share/pixmaps")).unwrap();
        fs::write(dir.join("share/pixmaps/old.png"), "png").unwrap();

        let dirs = [icons.clone()];
        assert_eq!(find_icon("app", &dirs), Some(icons.join("hicolor/128x128/apps/app.png")));
        assert_eq!(find_icon("app.png", &dirs), Some(icons.join("hicolor/128x128/apps/app.png")));
        assert_eq!(find_icon("vector", &dirs), Some(icons.join("hicolor/scalable/apps/vector.svg")));
        assert_eq!(find_icon("old", &dirs), Some(dir.join("share/pixmaps/old.png")));
        assert_eq!(find_icon("missing", &dirs), None);
        let absolute = icons.join("hicolor/48x48/apps/app.png");
        assert_eq!(find_icon(absolute.to_str().unwrap(), &dirs), Some(absolute));
        fs::remove_dir_all(dir).unwrap();
    }
}
