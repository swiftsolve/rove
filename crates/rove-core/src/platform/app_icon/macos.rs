//! macOS app icons: `NSRunningApplication` by pid, else Launch Services by name,
//! drawn into a 64px PNG with its glyph filling the tile.
use super::trim::content_bounds;
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
    let app = NSRunningApplication::runningApplicationWithProcessIdentifier(i32::try_from(pid).ok()?)?;
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

/// Draw `icon` into a [`ICON_PX`]² PNG `data:` URI, its glyph filling the
/// tile like every other OS's (see [`super::trim`]): drawn once to measure the
/// glyph, then again scaled and centred on it. Redrawing, rather than
/// cropping the first bitmap, keeps the glyph as sharp as the icon's best
/// representation.
fn render_png_data_uri(icon: &NSImage) -> Option<String> {
    let side = ICON_PX as f64;
    let tile = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(side, side));
    let first = draw_icon(icon, tile)?;
    let rep = match glyph_fill_rect(&first) {
        Some(dest) => draw_icon(icon, dest)?,
        None => first,
    };
    let props = NSDictionary::<NSBitmapImageRepPropertyKey, AnyObject>::new();
    // SAFETY: an empty properties dictionary is valid for the PNG encoder.
    let png = unsafe { rep.representationUsingType_properties(NSBitmapImageFileType::PNG, &props) }?;
    let bytes = png.to_vec();
    if bytes.is_empty() {
        return None;
    }
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Some(format!("data:image/png;base64,{b64}"))
}

/// Where to draw the icon so the glyph `rep` shows fills the tile edge to
/// edge, centred: the whole tile scaled by the glyph's padding and shifted
/// onto its centre, the overhang clipped. `None` when nothing is
/// visible.
fn glyph_fill_rect(rep: &NSBitmapImageRep) -> Option<NSRect> {
    let side = ICON_PX as usize;
    let stride = usize::try_from(rep.bytesPerRow()).ok()?;
    let data = rep.bitmapData();
    if data.is_null() || stride < side * 4 {
        return None;
    }
    // SAFETY: the rep owns `stride * side` bytes of interleaved RGBA (8 bits
    // per sample, 4 samples, per its initialiser), alive while `rep` is.
    let bytes = unsafe { std::slice::from_raw_parts(data, stride * side) };
    let rgba: Vec<u8> = bytes.chunks(stride).flat_map(|row| &row[..side * 4]).copied().collect();
    let bounds = content_bounds(&rgba, side, side)?;

    let scale = side as f64 / bounds.side() as f64;
    // Bitmap rows run top down; the drawing context's y runs bottom up.
    let (center_x, center_from_top) = bounds.center();
    let center_y = side as f64 - center_from_top;
    let half = side as f64 / 2.0;
    Some(NSRect::new(
        NSPoint::new(half - center_x * scale, half - center_y * scale),
        NSSize::new(side as f64 * scale, side as f64 * scale),
    ))
}

/// Draw `icon` into `dest` of a fresh offscreen [`ICON_PX`]² RGBA bitmap.
/// Drawing, rather than reading a representation, gives the exact size
/// whatever reps the icon ships.
fn draw_icon(icon: &NSImage, dest: NSRect) -> Option<Retained<NSBitmapImageRep>> {
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
        // A zero source rect means "the whole image", letting AppKit pick the
        // best representation for the destination size.
        let whole = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(0.0, 0.0));
        icon.drawInRect_fromRect_operation_fraction(dest, whole, NSCompositingOperation::SourceOver, 1.0);
        NSGraphicsContext::restoreGraphicsState_class();
        Some(rep)
    }
}
