# App & tray icons

All the raster icons here are generated from the Rove Mark. Because no
SVG rasterizer was assumed to be available, the sources are pure-`stdlib` Python
scripts that render the mark analytically to transparent RGBA PNGs.

## Files

- `icon-source.png`: the 1024×1024 app-icon master (dark squircle tile + the
  Rove Mark in accent blue). Feed this to `tauri icon`.
- `icon-source.py`: generates `icon-source.png`. Tweak tile margin, corner
  radius, colors, or glow here.
- `tray-source.py`: generates `tray.png`, the monochrome menu-bar/tray icon
  (black on transparent; macOS tints it as a template image).
- `tray-light.png`: the same mark in white, the tray icon on Windows and Linux,
  where a black icon vanishes on a dark taskbar. No script generates it: redraw
  it by hand from `tray.png` when the mark changes.

`apps/rove/src-tauri/src/tray.rs` embeds both with `include_bytes!`: `tray.png`
on macOS, `tray-light.png` everywhere else.

## Regenerate

Run these from `apps/rove/src-tauri/`:

```sh
# app icon: render the master, then fan out every platform size/format
python3 icons/icon-source.py icons/icon-source.png
npm run tauri -- icon icons/icon-source.png

# macOS tray icon (embedded in src/tray.rs)
python3 icons/tray-source.py icons/tray.png
```

`tauri icon` overwrites `icon.png`, `icon.icns`, `icon.ico`, the `Square*Logo`
tiles, `StoreLogo.png`, and the `android/` + `ios/` sets. The tray icon is not
managed by `tauri icon`; regenerate `tray.png` with `tray-source.py`, and
redraw `tray-light.png` to match, when the mark changes.
