//! Real per-application icons on macOS.
//!
//! The per-app usage list ([`crate::app_usage`]) only knows a process *name* and
//! its pid. To show the same icon the Dock/Finder would, we resolve that process
//! to an AppKit [`NSImage`] and rasterise it to a small PNG the frontend renders
//! directly (a `data:` URI). Two lookups, best-effort and in that order:
//!
//!   1. **By pid** — `NSRunningApplication(pid)`. Precise: it's the exact process
//!      that moved the bytes. Gated on `bundleURL` so only real `.app`s match,
//!      not daemons (whose "icon" would be a generic executable placeholder).
//!   2. **By name** — `NSWorkspace.fullPathForApplication`. Catches the common
//!      case where the traffic came from a helper process (e.g. a browser's
//!      network service) whose pid isn't itself an "application", but whose name
//!      still names an installed app.
//!
//! Anything that resolves to neither (CLIs, system daemons, unrecognised names)
//! returns `None`, and the UI keeps its existing favicon/monogram fallback.
//! Off macOS this is a no-op returning `None`.

#[cfg(target_os = "macos")]
mod imp {
    use base64::Engine as _;
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2::AnyThread as _;
    use objc2_app_kit::{
        NSBitmapImageFileType, NSBitmapImageRep, NSBitmapImageRepPropertyKey,
        NSCalibratedRGBColorSpace, NSCompositingOperation, NSGraphicsContext, NSImage,
        NSRunningApplication, NSWorkspace,
    };
    use objc2_foundation::{NSDictionary, NSPoint, NSRect, NSSize, NSString};

    /// Edge length of the rasterised icon, in pixels. App icons ship at up to
    /// 1024px; downscaling to 64 keeps the `data:` URI to a few KB so a list of
    /// them stays cheap to serialise across IPC while staying crisp in a ~16–24px
    /// box on high-DPI screens.
    const ICON_PX: isize = 64;

    /// A `data:image/png;base64,…` icon for the app that owns `pid` (preferred),
    /// or that `name` resolves to (fallback), or `None` when neither is an
    /// installed app.
    pub fn app_icon_data_uri(name: &str, pid: Option<u32>) -> Option<String> {
        let icon = pid.and_then(icon_via_pid).or_else(|| icon_via_name(name))?;
        render_png_data_uri(&icon)
    }

    /// The exact icon of the running application with this pid, but only if it is
    /// a bundled `.app` (the `bundleURL` gate) — so background/helper pids that
    /// aren't applications fall through to the name lookup rather than yielding a
    /// generic executable icon.
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

    /// Draw `icon` into an offscreen [`ICON_PX`]²  RGBA bitmap and return it as a
    /// base64 PNG `data:` URI. Drawing (rather than reading a representation)
    /// guarantees the exact target size regardless of which reps the icon ships.
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
            let dest =
                NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(ICON_PX as f64, ICON_PX as f64));
            // A zero source rect means "the whole image", letting AppKit pick the
            // best representation for the destination size.
            let whole = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(0.0, 0.0));
            icon.drawInRect_fromRect_operation_fraction(
                dest,
                whole,
                NSCompositingOperation::SourceOver,
                1.0,
            );
            NSGraphicsContext::restoreGraphicsState_class();

            let props = NSDictionary::<NSBitmapImageRepPropertyKey, AnyObject>::new();
            let png =
                rep.representationUsingType_properties(NSBitmapImageFileType::PNG, &props)?;
            let bytes = png.to_vec();
            if bytes.is_empty() {
                return None;
            }
            let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
            Some(format!("data:image/png;base64,{b64}"))
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod imp {
    /// No native icon source wired up off macOS; the UI falls back to favicon +
    /// monogram. `name`/`pid` are accepted so callers stay platform-agnostic.
    pub fn app_icon_data_uri(_name: &str, _pid: Option<u32>) -> Option<String> {
        None
    }
}

pub use imp::*;
