//! Trims the transparent margin an app icon's canvas bakes in, the same on
//! every OS. Icons pad very differently (Claude's and Edge's glyph covers
//! ~80% of its canvas, Chrome's and node's reach the edge), and the UI's
//! `object-fit: contain` scales the whole canvas into the tile, so a padded
//! glyph looks small next to an edge-to-edge one. Cropping each to its glyph
//! removes that difference, and matches the favicons and monograms beside
//! them, which fill their tile too.

/// Alpha at or below this is ignored, so a faint anti-aliasing fringe or halo
/// doesn't defeat the trim by pinning the bounds to the full canvas.
const ALPHA_THRESHOLD: u8 = 12;

/// The inclusive pixel box of an image's visible content, rows counted from
/// the top.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct Bounds {
    pub min_x: usize,
    pub min_y: usize,
    pub max_x: usize,
    pub max_y: usize,
}

impl Bounds {
    /// The longer of the box's width and height.
    pub fn side(&self) -> usize {
        (self.max_x - self.min_x + 1).max(self.max_y - self.min_y + 1)
    }

    /// The box's centre, in pixels from the left and top.
    pub fn center(&self) -> (f64, f64) {
        ((self.min_x + self.max_x + 1) as f64 / 2.0, (self.min_y + self.max_y + 1) as f64 / 2.0)
    }
}

/// The box around `rgba`'s (`w`×`h`, row-major, top row first) visible
/// pixels, or `None` when nothing is visible.
pub(super) fn content_bounds(rgba: &[u8], w: usize, h: usize) -> Option<Bounds> {
    if w == 0 || h == 0 || rgba.len() < w * h * 4 {
        return None;
    }
    let mut bounds: Option<Bounds> = None;
    for y in 0..h {
        for x in 0..w {
            if rgba[(y * w + x) * 4 + 3] <= ALPHA_THRESHOLD {
                continue;
            }
            let b = bounds.get_or_insert(Bounds { min_x: x, min_y: y, max_x: x, max_y: y });
            b.min_x = b.min_x.min(x);
            b.max_x = b.max_x.max(x);
            b.max_y = y;
        }
    }
    bounds
}

/// Crop `rgba` (`w`×`h`, straight alpha) to the square around its visible
/// pixels, their longer side edge to edge. Square and centred, so
/// the aspect ratio is kept. `None` when nothing is visible: a fully
/// transparent image to encode as is. macOS redraws instead (see
/// `macos::glyph_fill_rect`).
#[cfg(any(target_os = "windows", target_os = "linux", test))]
pub(super) fn trim_to_content_square(rgba: &[u8], w: usize, h: usize) -> Option<(Vec<u8>, usize)> {
    let bounds = content_bounds(rgba, w, h)?;
    let side = bounds.side();

    // Top-left of the square, centred on the content box. Signed so the
    // shorter side's padding can overhang the source edge (when the glyph
    // reaches it); overhang is filled with transparent pixels.
    let (center_x, center_y) = bounds.center();
    let half_side = side as f64 / 2.0;
    let start_x = crate::utils::round_to_i64(center_x - half_side);
    let start_y = crate::utils::round_to_i64(center_y - half_side);

    let mut out = vec![0u8; side * side * 4];
    for oy in 0..side {
        let Some(sy) = source_coordinate(start_y, oy, h) else {
            continue;
        };
        for ox in 0..side {
            let Some(sx) = source_coordinate(start_x, ox, w) else {
                continue;
            };
            let src = (sy * w + sx) * 4;
            let dst = (oy * side + ox) * 4;
            out[dst..dst + 4].copy_from_slice(&rgba[src..src + 4]);
        }
    }
    Some((out, side))
}

/// The source pixel `offset` past `start`, or `None` when it falls outside
/// `0..limit` (the square's overhang).
#[cfg(any(target_os = "windows", target_os = "linux", test))]
fn source_coordinate(start: i64, offset: usize, limit: usize) -> Option<usize> {
    let coordinate = start.checked_add(i64::try_from(offset).ok()?)?;
    usize::try_from(coordinate).ok().filter(|&coordinate| coordinate < limit)
}

#[cfg(test)]
mod tests {
    use super::*;

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

    /// The box is the content's, inclusive, with rows from the top.
    #[test]
    fn bounds_the_visible_pixels() {
        let buf = canvas(10, 8, 2, 1, 7, 4);
        let bounds = content_bounds(&buf, 10, 8).unwrap();
        assert_eq!(bounds, Bounds { min_x: 2, min_y: 1, max_x: 6, max_y: 3 });
        assert_eq!(bounds.side(), 5);
        assert_eq!(bounds.center(), (4.5, 2.5));
    }

    /// A small glyph in a large transparent canvas is cropped to just the
    /// glyph.
    #[test]
    fn crops_away_transparent_padding() {
        // 20px block centred in a 100px canvas.
        let buf = canvas(100, 100, 40, 40, 60, 60);
        let (out, side) = trim_to_content_square(&buf, 100, 100).unwrap();
        assert_eq!(side, 20);
        assert!(out.as_chunks::<4>().0.iter().all(|px| px[3] == 255), "the glyph should fill the square");
    }

    /// A wide glyph is centred, padded top and bottom.
    #[test]
    fn centres_a_wide_glyph_in_its_square() {
        let buf = canvas(40, 40, 5, 15, 35, 25);
        let (out, side) = trim_to_content_square(&buf, 40, 40).unwrap();
        assert_eq!(side, 30);
        let alpha_at = |x: usize, y: usize| out[(y * side + x) * 4 + 3];
        assert_eq!((alpha_at(15, 0), alpha_at(15, 15), alpha_at(15, 29)), (0, 255, 0));
        assert_eq!((alpha_at(0, 10), alpha_at(29, 19)), (255, 255));
    }

    /// Two icons padded differently come out filling their square alike.
    #[test]
    fn padded_and_edge_to_edge_icons_end_up_the_same() {
        let padded = canvas(128, 128, 12, 12, 116, 116);
        let full = canvas(104, 104, 0, 0, 104, 104);
        let (_, padded_side) = trim_to_content_square(&padded, 128, 128).unwrap();
        let (_, full_side) = trim_to_content_square(&full, 104, 104).unwrap();
        assert_eq!(padded_side, full_side);
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

    /// A fully transparent image has nothing to bound, so the caller is told
    /// to encode it untouched rather than crop to an empty square.
    #[test]
    fn fully_transparent_image_is_not_cropped() {
        assert!(trim_to_content_square(&[0u8; 8 * 8 * 4], 8, 8).is_none());
    }
}
