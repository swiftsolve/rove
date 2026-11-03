//! macOS app icons: `NSRunningApplication` by pid, else Launch Services by name,
//! drawn into a 64px PNG.
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
