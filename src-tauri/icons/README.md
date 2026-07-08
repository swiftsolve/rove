# App & tray icons

All the raster icons here are generated from the Rove Mark. Because no
SVG rasterizer was assumed to be available, the sources are pure-`stdlib` Python
scripts that render the mark analytically to transparent RGBA PNGs.

## Files

- `icon-source.png` — the 1024×1024 app-icon master (dark squircle tile + the
  Rove Mark in accent blue). Feed this to `tauri icon`.
- `icon-source.py` — generates `icon-source.png`. Tweak tile margin, corner
  radius, colors, or glow here.
- `tray-source.py` — generates `tray.png`, the monochrome menu-bar/tray glyph
  (black on transparent; the Rust side renders it as a macOS template image).

## Regenerate

```sh
# app icon: render the master, then fan out every platform size/format
python3 icons/icon-source.py icons/icon-source.png
npm run tauri -- icon icons/icon-source.png     # run from the src-tauri/ dir

# tray glyph (embedded via include_bytes! in src/lib.rs)
python3 icons/tray-source.py icons/tray.png
```

`tauri icon` overwrites `icon.png`, `icon.icns`, `icon.ico`, the `Square*Logo`
tiles, `StoreLogo.png`, and the `android/` + `ios/` sets. The tray glyph is not
managed by `tauri icon` — regenerate it with `tray-source.py` when the mark
changes.
