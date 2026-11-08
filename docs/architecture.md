# How Rove Is Put Together

Four diagrams for the decisions that shape everything else: where the UI stops
and the backend starts, which direction data moves, and what a call across that
gap actually is.

> **Companion pages:**
> - [Learning Rust & Tauri through Rove](learning/rust-and-tauri/README.md): the same
>   boundary from the language side, with the Rust concepts spelled out.
> - [How Rove Captures Network Data (per OS)](networking/data-capture.md): the
>   per-OS probes behind every command below.
> - [How Rove Discovers & Identifies LAN Devices](networking/device-discovery.md): the
>   device-scan pipeline in full.

---

## 1. The swap seam

Every screen reads from one object on `window`. Two things can supply it, and
nothing above the line can tell which one did.

<div align="center">
  <img src="assets/bridge-seam.svg" width="820" alt="React views and hooks sit above a dashed seam labelled window.networkAPI; below it the path splits into a Tauri bridge leading to the Rust backend, or a browser mock leading to nothing at all" />
</div>

`src/types/api.ts` declares the interface. Two files implement it:
`src/bridge/tauri-network-api.ts` forwards each method to a Tauri command, and
`src/bridge/mock-network-api.ts` answers from memory. `src/main.tsx` picks one at
startup:

```ts
if (isTauri()) {
  installTauriBridge()
} else if (import.meta.env.DEV) {
  installMockNetworkApiIfNeeded()
}
```

The mock isn't a fixture file: it fakes *time* as well as data: calls resolve
after a plausible delay, live throughput ticks once a second with a periodic
burst, and a speed test runs a scripted ten-second ramp that can be cancelled
mid-flight. Which is why `npm run dev` gives a fully populated UI in a plain
browser, why `npm run screenshots` produces the same shots on any machine
without leaking a real SSID, and why the same build can run inside an iframe as
a live demo.

Two consequences worth knowing:

- **Nothing keeps the two type definitions in sync.** Serde guarantees the
  Rust struct matches the JSON it emits; nothing checks that against the
  TypeScript. Rename a field in Rust and the UI still compiles, then reads
  `undefined` at runtime. `ts-rs` or `specta` would close this by generating one
  side from the other.
- **The mock re-implements one rule.** `rateCapability` in the mock mirrors
  `rate` in `crates/rove-core/src/capabilities.rs` so demo ratings match
  production. Two copies of one rule, and nothing checks they agree.

**Not everything goes through the bridge.** Two files call Tauri directly:
`features/about/hooks/useAppVersion.ts` (app version) and
`app/utils/updater.ts` (check + relaunch). All are desktop-only by nature with nothing
meaningful to mock, and each degrades to nothing in a browser. The rule is:
*anything the UI renders goes through the bridge; anything that only exists on a
desktop doesn't.*

---

## 2. Two directions, and only five exceptions

<div align="center">
  <img src="assets/pull-push.svg" width="820" alt="React on the left and Rust on the right: React sends about thirty invoke commands rightward and receives JSON back, while Rust pushes five named events leftward without being asked" />
</div>

**Pull when React knows it needs something**: a tab opened, a button was
pressed, a poll fired. That covers roughly thirty commands, registered in
`src-tauri/src/lib.rs` and implemented in `src-tauri/src/commands.rs`.

**Push when only Rust knows something happened.** Five events qualify, each
because it is continuous, arrives mid-operation, or is triggered from outside
the app:

| Event | Why it can't be pulled |
|---|---|
| `live-throughput` | 1 Hz forever; polling it would be silly |
| `speed-test-progress` | one call takes ~10 s, progress must arrive *during* it |
| `network-changed` | only the kernel knows you pulled the cable |
| `internet-status` | a background heartbeat notices, not the UI |
| `services-timeline` | runs even with the window closed |

Push costs more than pull: subscribe, unsubscribe, tear down on unmount, and
handle events that land *after* teardown (`useOnNetworkChanged` keeps an
`active` flag for exactly that race). So it stays rare.

Two places the directions mix:

- **Pull to turn push on.** `subscribe_live_throughput` / `unsubscribe_live_throughput`
  are ordinary commands that flip an atomic flag; the 1 Hz loop in
  `src-tauri/src/monitors.rs` skips its work entirely while it's false, so an
  unwatched window costs nothing.
- **Push that triggers a pull**: the next section.

---

## 3. The event that carries nothing

<div align="center">
  <img src="assets/network-changed.svg" width="820" alt="The kernel's routing table changes; a Rust monitor emits a network-changed event carrying no payload; React responds by re-running the fetch it already had" />
</div>

A 15-second poll is correct and feels dead. Rather than build a second data path
for instant updates, `network-changed` ships **no payload at all**:

```rust
let _ = handle.emit("network-changed", &());
```

React answers it by re-running the fetch it already had:

```ts
useOnNetworkChanged(() => void refresh(true))
```

So the connection card updates within about a second of a cable pull, the poll
stays as the safety net, and there is no second payload to keep in sync with the
request path. The tap says *when*; the existing pull says *what*.

The monitor behind it watches `ip monitor route` and is Linux-only; macOS and
Windows fall back to the poll.

---

## 4. What one `invoke` actually is

<div align="center">
  <img src="assets/ipc-anatomy.svg" width="820" alt="A POST to ipc://localhost/get_network_info carrying a Tauri-Invoke-Key header and a JSON body; the reply is application/json with a Tauri-Response header reading ok" />
</div>

Tauri registers custom URI schemes with the webview, the same mechanism that
serves the bundled UI out of the binary. Two are in play: `tauri://localhost`
for assets (`http://tauri.localhost` on Windows), and `ipc` for commands.

A command call is shaped like HTTP but never reaches the network. The command
name is read from the URL path, the arguments are the JSON body, and a
`Tauri-Response` header of `ok` or `error` is what decides whether the promise
resolves or rejects. `Tauri-Invoke-Key` is checked so page content can't fire
commands on its own, defence in depth alongside
`src-tauri/capabilities/default.json`, which already limits the webview to our
commands, event listening and the frameless-window controls.

There is no local HTTP server and no open port; nothing else on the machine can
connect to it.

**Sync vs async matters on the Rust side.** Every command returns a promise in
JavaScript, but a plain `fn` command runs on the main thread while an `async fn`
runs on a thread pool. The split in `commands.rs` follows that: anything that
probes, shells out or hits the network is `async` (`get_devices`,
`run_speed_test`, `get_network_info`); the cheap in-memory and database reads are
sync (`get_app_usage`, `get_speed_history`, `cancel_speed_test`). A slow command
declared sync would freeze the window while the UI politely awaited it, and
nothing in the type system would warn you.

---

## Where the frameworks stop

| Written for Rove | Came with the tools |
|---|---|
| The bridge: one object on `window`, two implementations | The window: native, frameless, from JSON config |
| The contract: TypeScript types mirrored by Rust structs | The IPC transport plus the `#[tauri::command]` glue |
| The mock: data *and* time, ~960 lines | Asset embedding: the UI compiled into the binary |
| `useBackendQuery`: loading, polling, pause-when-hidden, race handling | Permissions: the deny-by-default capability manifest |
| The live store: one owner, 60 s history, idle hysteresis | Installers: deb, AppImage, dmg, nsis, msi, and signing |
| Every measurement in `crates/rove-core` | Rendering: React renders; it has no opinion on fetching |

Tauri owns the container and the pipe; serde owns the translation; the bridge
owns the naming. Keeping a seam of our own *above* the framework's seam is what
makes the mock (and therefore the browser demo) possible at all.

---

## Where everything lives

The whole repository, folder by folder.

```
rove/
├── src/                        React UI (Vite)
│   ├── main.tsx                entry: installs the bridge, mounts the app
│   ├── app/                    the shell, laid out like a feature: App.tsx
│   │                           (providers) and AppShell.tsx at the top, then
│   │                           components/ (title bar, nav rail,
│   │                           CurrentScreen), context/ (navigation, theme,
│   │                           network), hooks/ (useNetwork,
│   │                           useInternetStatus, useConnectionStatus, …)
│   │                           and utils/ (incl. the TanStack query client)
│   ├── features/               one folder per area: home, speed,
│   │   │                       capabilities, connection, live-throughput,
│   │   │                       interfaces, devices, events, usage, apps,
│   │   │                       diagnostics, services, settings, about
│   │   └── <area>/             its views at the top
│   │       ├── components/     parts of those views, when a view has them
│   │       ├── context/        its own context, if it ever needs one
│   │       ├── hooks/          that area's data and state hooks
│   │       └── utils/          its plain helpers (no React)
│   │                           (capabilities, connection and live-throughput
│   │                           have no view, so their parts sit at the top)
│   ├── ui/                     the component library, imported from @/ui:
│   │                           a folder per component (with its stories)
│   │                           and icons
│   ├── hooks/                  shared hooks (useBackendQuery is the
│   │                           useQuery shape every data hook builds on)
│   ├── utils/                  shared helpers (format, platform, highlight)
│   ├── styles/                 the global CSS: tailwind.css (the theme from
│   │                           the tokens; imports the rest), base.css
│   │                           (fonts, resets) and utilities.css (shared
│   │                           type styles and layout, as utilities)
│   ├── types/                  the UI↔backend contract (mirrored in Rust)
│   └── bridge/                 the contract's two implementations: Tauri, and
│                               the browser mock (npm run dev without Tauri)
├── crates/rove-core/           all platform services in pure Rust (no Tauri/GTK
│   │                           deps, so it compiles and tests anywhere), a module per
│   │                           domain, named as in src/features: apps/,
│   │                           capabilities, connection, devices/, diagnostics,
│   │                           interfaces, live_throughput, services, speed,
│   │                           usage; plus platform/ (per-OS probes), store/
│   │                           (SQLite, a file per domain) and utils/ (net,
│   │                           shell, geoip, tls)
│   └── data/                   bundled lookup tables (OUI, IP-to-country)
├── src-tauri/                  thin Tauri shell: one #[tauri::command] per
│   │                           service, events, capabilities, window config
│   ├── linux/                  .deb install/remove scripts, AppArmor profile
│   └── macos/                  the optional root DHCP helper's LaunchDaemon
├── scripts/                    tooling: checks/ (the lint gates `npm run lint`
│                               runs), gen/ (the *.gen.* files `npm run gen`
│                               writes), hooks/ (git and Claude Code), eslint/,
│                               screenshots and the a11y audit
├── schemas/                    a JSON Schema for each project JSON file
│                               (figma-components, components, cn-theme): what
│                               each key means; the generators validate against them
└── docs/                       the deeper dives (index in docs/README.md),
                                diagrams and screenshots
```

