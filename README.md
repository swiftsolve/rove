# Beacon

A fast, minimal desktop network monitor — live traffic, speed tests, LAN device
discovery, connection diagnostics, and data-usage tracking. Tauri (Rust) + React.

## Architecture

```
beacon/
├── src/                  React UI (Vite). Talks to the backend through
│   │                     `window.networkAPI` — see src/bridge/tauriNetworkApi.ts
│   └── dev/              Browser mock bridge for UI work without a backend
├── shared/types/         TypeScript contracts shared by UI and bridge
├── crates/beacon-core/   All platform services in pure Rust (no Tauri/GTK deps —
│                         compiles and tests anywhere):
│                         network_info, interfaces, devices, diagnostics,
│                         speed, live_throughput, data_usage, oui
└── src-tauri/            Thin Tauri shell: one #[tauri::command] per service,
                          events for progress/throughput, window config
```

Serialized field names are camelCase on the wire, so the Rust types mirror
`shared/types/*.ts` exactly.

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
