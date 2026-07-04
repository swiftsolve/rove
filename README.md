# Beacon

A fast, minimal desktop network monitor — live traffic, speed tests, LAN device
discovery, connection diagnostics, and data-usage tracking. Tauri (Rust) + React.

## Architecture

```
beacon/
├── src/                        React UI (Vite)
│   ├── main.tsx, App.tsx       entry + shell (header, nav, view switching)
│   ├── views/                  one file per page: Home, Interfaces, Devices,
│   │                           Usage, Diagnostics
│   ├── components/
│   │   ├── ui/                 app-agnostic chrome: Section, DataRow, Subpage,
│   │   │                       TabBar, Icons (lucide re-exports)
│   │   ├── connection/         connection card + display helpers
│   │   ├── traffic/            live throughput panel, chart, readouts
│   │   ├── speed-test/         speed test section + history (+ storage)
│   │   └── capabilities/       capability list, details, meter, icon, rating
│   ├── hooks/                  data hooks over window.networkAPI
│   ├── lib/                    generic helpers (format, chart geometry)
│   ├── types/                  the UI↔backend contract (Rust mirrors these
│   │                           shapes in beacon-core/src/types.rs, camelCase)
│   ├── bridge/                 Tauri implementation of the contract
│   ├── navigation/             tab definitions
│   └── dev/                    browser mock bridge (npm run dev without Tauri)
├── crates/beacon-core/         all platform services in pure Rust (no Tauri/GTK
│                               deps — compiles and tests anywhere): network_info,
│                               interfaces, devices, diagnostics, speed,
│                               live_throughput, data_usage, oui, shell
└── src-tauri/                  thin Tauri shell: one #[tauri::command] per
                                service, events for progress/throughput
```

## Development

One-time system deps (Linux):

```bash
sudo apt install -y build-essential libwebkit2gtk-4.1-dev libgtk-3-dev \
  librsvg2-dev libayatana-appindicator3-dev
# Rust, if missing: https://rustup.rs
```

Then:

```bash
npm install
npm run tauri:dev     # run the desktop app (hot-reloads the UI)
npm run dev           # UI only, in a browser, against the mock bridge
cargo check -p beacon-core   # typecheck the service layer alone
```

## Release build

```bash
npm run tauri:build   # AppImage + deb (Linux), dmg (macOS), nsis (Windows)
```

## Platform support

Linux is fully implemented (`ip`/`iw`/`nmcli`/`getent`/sysfs). macOS and
Windows paths are ported from the original implementation (`airport`,
`netsh`, PowerShell, `arp -a`) with graceful degradation where a tool is
unavailable — values render as “—” rather than failing.

> **Dev note (Linux/snap):** if you launch from a snap-packaged terminal (e.g.
> VS Code from snap), unset its library path first or the binary picks up
> snap's glibc and crashes at startup:
> `env -u LD_LIBRARY_PATH -u GTK_PATH npm run tauri:dev`
