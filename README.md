<div align="center">

<img src="src-tauri/icons/128x128.png" width="88" height="88" alt="Rove" />

# Rove

**A fast, minimal desktop network monitor.**

Live traffic, speed tests, LAN device discovery, connection diagnostics and data-usage tracking

<p>
  <img alt="Tauri v2" src="https://img.shields.io/badge/Tauri-v2-24C8DB?style=flat-square&logo=tauri&logoColor=white" />
  <img alt="Rust" src="https://img.shields.io/badge/Rust-backend-000000?style=flat-square&logo=rust&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-UI-149ECA?style=flat-square&logo=react&logoColor=white" />
  <img alt="Platforms" src="https://img.shields.io/badge/Linux%20%7C%20macOS%20%7C%20Windows-3d6fe0?style=flat-square" />
</p>

</div>

---

## How it works

Rove is two programs talking over a thin, typed bridge:

<div align="center">
  <img src="docs/assets/architecture-v2.svg" width="820" alt="Rove architecture: a React UI and a Rust backend communicating over a typed Tauri bridge" />
</div>

- **Request/response.** Each UI data need is one Tauri *command* (`get_network_info`,
  `get_devices`, `run_speed_test`, …), a thin wrapper in `src-tauri/src/commands.rs`
  (registered in `lib.rs`) around a pure-Rust service in `crates/rove-core`.
- **Push.** Five *events* flow the other way, each because it's continuous,
  arrives mid-operation, or is triggered from outside the app: `live-throughput`
  (1 Hz while subscribed), `speed-test-progress`, `internet-status` and
  `services-timeline` (from the always-on background heartbeats), and
  `network-changed` (the backend watches `ip monitor route` and nudges the UI
  within ~1 s of a cable pull or Wi-Fi join, so state never waits on the 15 s
  poll). That last one carries no payload at all: it just makes the pull that
  already exists happen now.
- **The contract.** TypeScript types in `src/types/` define every payload; the
  Rust structs in `crates/rove-core` mirror them field-for-field, each in the
  module that produces it (serde renames everything to camelCase on the wire). The UI never knows it's
  talking to Rust: `src/bridge/tauri-network-api.ts` implements the same
  `window.networkAPI` interface that a browser mock (`src/dev/`) also implements,
  which is why `npm run dev` works in a plain browser for UI work.

> **Deeper dives**
> - [Rove frontend](docs/develop/frontend.md): how the UI is organised and styled, and
>   which component to use for what.
> - [How Rove Is Put Together](docs/develop/architecture.md): the swap seam, pull vs
>   push, and what an `invoke` is on the wire.
> - [Learning Rust & Tauri through Rove](docs/develop/learning/rust-and-tauri/README.md): the
>   same boundary from the language side.
> - [How Rove Captures Network Data (per OS)](docs/networking/data-capture.md)
> - [How Rove Discovers & Identifies LAN Devices](docs/networking/device-discovery.md)
> - [The Networking Protocols Behind Rove's Device Discovery](docs/networking/protocols.md)
> - [Why "Rove"?](docs/project/why-rove.md)
>
> All of them, grouped: [docs/](docs/README.md).

### What each feature actually measures

**Connection card / network info.** The kernel routing table is the source of
truth: `ip route show default` names the interface your traffic really uses
(so LAN↔Wi-Fi switches are always right), then per-medium tools fill in the
detail: `iw`/`nmcli` for SSID, band, channel, signal; `ethtool`/sysfs for link
speed and duplex. DNS comes from `resolv.conf`.

**Live traffic.** A 1 Hz sampler reads the kernel's cumulative per-interface
byte counters (via `sysinfo`), converts deltas to Mbps, smooths them with an
exponential moving average, and emits an event. Virtual interfaces (docker,
veth, vpn…) are excluded.

**Devices.** A five-stage pipeline (`crates/rove-core/src/devices/`), walked
in full in [docs/networking/device-discovery.md](docs/networking/device-discovery.md):

<div align="center">
  <img src="docs/assets/pipeline-glance.svg" width="820" alt="Five stages: Scope the subnet, Provoke every host, Read the neighbor table, Enrich each host, Assemble the list" />
</div>

1. *Scope*: take the active interface's subnet (e.g. `192.168.1.0/24`).
2. *Provoke*: for ~3 s, ping every host and try a TCP connect to a dozen
   tell-tale ports (80, 443, 9100, 8009, 62078, …), while listening for mDNS
   (`_googlecast`, `_ipp`, `_hap`, …) and SSDP/UPnP announcements. The replies
   matter less than the ARP lookup each probe forces: a device enters the
   kernel neighbor table even if it drops ping and refuses every port. Ports
   that accept double as type hints. Active probing runs on /24–/30 subnets only.
3. *Read*: `ip neigh` (or `arp -a`) is the ground truth of who exists.
4. *Enrich & classify*: each host gets a vendor (MAC OUI table, randomized
   MACs flagged), a hostname (reverse DNS, mDNS, HTTP banner, NetBIOS; junk
   names filtered), and a best-effort kind from a trust-weighted vote over
   mDNS services and models, SSDP descriptions, open ports, and hostname and
   vendor patterns. The router also gets an SNMP `sysDescr` read, and DHCP
   fingerprints count when the passive listener can bind :67.
5. *Assemble*: add this machine, sort gateway → self → by address, dedupe by
   MAC.

A device that blocks every probe still appears, just unnamed. What gets missed
is a device that's asleep and doesn't answer ARP, a client on a guest network
or behind AP isolation, another VLAN, and, on subnets larger than /24, anything
that neither announces itself nor already sits in the neighbor table. The
router's admin page stays authoritative.

**Speed test.** Saturates the link ~6 s per direction: parallel HTTPS streams
from public test endpoints (download) and random-payload POSTs (upload), then
10 pings to 1.1.1.1 for latency/jitter/loss. Progress streams as events; a
cancel command aborts between and within phases (streams poll a shared flag).
Results feed the capability ratings (can this connection do 4K, cloud gaming…)
against per-activity thresholds. Fair warning: at multi-gigabit rates one test
moves 1–2 GB. That's inherent to how throughput measurement works.

**Data usage.** Every 30 s the backend accumulates counter deltas into per-day
buckets persisted in the app-data dir (survives restarts; counters themselves
reset at boot, which the delta logic handles). The "since boot" totals shown in
the UI are read straight from `/sys/class/net/*/statistics` at query time:
kernel truth, no bookkeeping.

**Diagnostics.** Pings your default gateway (latency / jitter / packet loss)
and lists the DNS servers in use.

### Security model

Tauri v2 is deny-by-default: the webview can only call what
`src-tauri/capabilities/default.json` grants (our commands, event listening,
and the frameless-window controls). There is no Node runtime in the UI process
and the backend is memory-safe Rust.

The Hosts view knows which remote hosts each app talks to, a list that is
browsing history in all but name. *That list* never leaves your machine: country
flags are resolved against an IP-to-country table bundled in the binary
(`util/geoip.rs`), not by asking a geolocation API about each peer.

Two things do leave, neither of them a peer address:

- **Your own WAN identity**, when the Connection tab asks: your public IP
  (api.ipify.org). Your ISP, ASN, and country are then resolved from that IP
  against bundled tables (`util/geoip.rs`), no request. A best-effort call to
  ipwho.is only *enriches* the card with your city and ISP website when it isn't
  rate-limited; the card stays populated without it. Every request here is about
  your own address.
- **Brand icons**, via Google's favicon service (`ServiceIcon.tsx`). This sends a
  *domain*: `firefox.com` for Firefox, plus the services you've chosen to
  monitor. Never a discovered peer, and never a hostname the Hosts view
  reverse-resolved. Apps it doesn't recognise fall back to a letter monogram and
  ask nothing.

All of it is keyless: Rove ships no API credentials.

### Bundled data

| Table | Source | License | Refresh |
|---|---|---|---|
| MAC OUI → vendor (`data/oui.tsv`) | [IEEE Registration Authority](https://standards-oui.ieee.org/) | Public registry | `cargo run -p rove-core --example gen_oui` |
| IP → country (`data/dbip-country-lite.mmdb.gz`) | [IP Geolocation by DB-IP](https://db-ip.com) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | `cargo run -p rove-core --example gen_geoip` |
| IP → ASN (`data/dbip-asn-lite.mmdb.gz`) | [IP Geolocation by DB-IP](https://db-ip.com) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | `cargo run -p rove-core --example gen_geoip` |
| Hosting/VPN ASNs (`data/hosting-asns.txt`) | [brianhama/bad-asn-list](https://github.com/brianhama/bad-asn-list) | [MIT](https://opensource.org/licenses/MIT) | `cargo run -p rove-core --example gen_hosting_asns` |

The OUI and IP sources are chosen to be freely redistributable in a shipped binary: IEEE over
Wireshark's GPL-2.0 `manuf`, and DB-IP over MaxMind's GeoLite2, whose EULA
requires destroying superseded copies within 30 days of each twice-weekly
release, a term a binary already on users' machines cannot honour.

The Hosts view's country flags are drawn with the **Twemoji Country Flags**
font (`src/assets/fonts/TwemojiCountryFlags.woff2`), because Windows ships no
flag emoji of its own. The glyph artwork is [Twemoji](https://github.com/twitter/twemoji),
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## Layout

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
│   ├── bridge/                 Tauri implementation of the contract
│   └── dev/                    browser mock bridge (npm run dev without Tauri)
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
│                               runs), hooks/ (git and Claude Code), the UI
│                               catalogue, screenshots and the a11y audit
└── docs/                       the deeper dives (index in docs/README.md),
                                diagrams and screenshots
```

## Frontend

The UI follows a few conventions: state from context and TanStack Query, never
props passed through; Tailwind utilities built only from the design tokens;
shared components before new markup. [docs/develop/frontend.md](docs/develop/frontend.md)
has them all, with checklists for common changes and the component table.

Tokens are designed in the [Rove Design System](https://www.figma.com/design/NoICIoyhWNOya9tOnNfEhH/Rove-Design-System)
in Figma and released from [rove-tokens](https://github.com/swiftsolve/rove-tokens),
which syncs them both ways and checks that Figma and the package agree.
Components start in `src/ui`, and Figma mirrors them. To browse the design
system without Figma, see the [slideshow](https://swiftsolve.github.io/rove-tokens/).

## Development

One-time system deps (Linux):

```bash
sudo apt install -y build-essential libwebkit2gtk-4.1-dev libgtk-3-dev \
  librsvg2-dev libayatana-appindicator3-dev
# Rust, if missing: https://rustup.rs
```

Then:

```bash
npm install                  # also turns on the git hooks (scripts/hooks/git)
npx playwright install chromium   # once, for the story tests
npm run tauri:dev            # run the desktop app (hot-reloads the UI)
npm run dev                  # UI only, in a browser, against the mock bridge
npm run storybook            # the UI library's components, at localhost:6006
npm run screenshots          # refresh docs/screenshots: every screen, at window size
npm run format               # lay out the code with Prettier
npm run catalogue            # regenerate src/ui/components.gen.json after a library change
cargo run -p rove-core --example scan   # print a live LAN scan
```

Checking a change:

```bash
npm run check                # typecheck, lint, the repo's checks and every Vitest test
npm test                     # just the UI's unit, DOM and story tests
npm run a11y                 # axe on every screen and dialog, both themes
cargo test -p rove-core      # the service layer's tests
cargo clippy --workspace --all-targets -- -D warnings   # the Rust lints (Cargo.toml)
cargo fmt --all              # the Rust layout (rustfmt.toml)
```

CI runs `npm run check` on every push and pull request, and clippy on all
three OSes. Rust comments follow the UI's rules (no em dash, a `//`
note in 6 lines, a `///` doc in 10), checked by a `cargo test`
(`crates/rove-core/tests/comments.rs`).

> **Dev note (Linux/snap):** if you launch from a snap-packaged terminal (e.g.
> VS Code from snap), unset its library path first or the binary picks up
> snap's glibc and crashes at startup:
> `env -u LD_LIBRARY_PATH -u GTK_PATH npm run tauri:dev`

## Release build

```bash
npm run tauri:build   # .deb ~5 MB, AppImage, dmg (macOS), nsis (Windows)
```

## Platform support

All services run on Linux, macOS and Windows. Each looks for the native tool
for the job and degrades gracefully (a missing value shows as a short bar):

| | Linux | macOS | Windows |
|---|---|---|---|
| Default route / interface | `ip route` | `route -n get` | `Get-NetRoute` |
| Wi-Fi details | `nmcli`, `iw` | CoreWLAN, `system_profiler` | `netsh wlan` |
| Link speed | `ethtool`, sysfs | CoreWLAN (Wi-Fi) | `Get-NetAdapter` |
| DNS servers | `resolv.conf` | `resolv.conf` | `Get-DnsClientServerAddress` |
| Neighbor table | `ip neigh` | `arp -a` | `arp -a` |
| Reverse hostnames | `getent` | `dscacheutil` | `System.Net.Dns` |
| Interface state | sysfs | `ifconfig` | `Get-NetAdapter` |
| App icons | `.desktop` entries, icon theme | AppKit | Shell (`.exe` icon) |
| mDNS, sweep, speed test, throughput, usage | pure Rust everywhere | ✓ | ✓ |

Platform branches are runtime `cfg!()` checks, so every path typechecks on
every OS; CI (`.github/workflows/build.yml`) builds all three bundles. The
instant network-change monitor (`ip monitor route`) is Linux-only; macOS and
Windows fall back to the 15 s poll.

On macOS 14.4+ the private `airport` tool was gutted (it now only prints a
deprecation notice), so Rove reads Wi-Fi in-process via CoreWLAN, including the
link-speed / transmit rate, which the shell tools no longer expose. The SSID
sits behind Location Services, so Rove asks for that permission once at startup;
without it the network name shows as missing while everything else still
resolves.
