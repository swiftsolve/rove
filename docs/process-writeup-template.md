<!--
  PROCESS-WRITEUP TEMPLATE
  ------------------------
  This page is a *worked example* — a real case study for Rove — that doubles as a
  reusable template for a portfolio process writeup. To reuse it for a new project:
  copy this file, keep the eight section headings, and swap the Rove-specific
  content for your own. Each section's job is described in "How to reuse this
  template" at the bottom. Aim for ~700-1000 words: a hiring manager should be
  able to scan it in two minutes and still see how you think.
-->

# Rove — a desktop network monitor

A case study in shipping a small, opinionated product end to end: the UX
decisions that shaped it and the engineering that made them real.

> **What this is.** A short process writeup, not a spec. It traces *why* Rove
> looks and behaves the way it does, and how those choices are implemented — so
> it shows both product thinking and code. The full technical deep-dives live in
> the sibling docs (e.g. [device discovery](./device-discovery.md),
> [data capture](./networking-data-capture.md)); this page is the narrative that
> connects them.

---

## At a glance

| | |
|---|---|
| **What** | A fast, minimal desktop app that shows your live connection, LAN devices, speed, and data usage |
| **My role** | Product, UX, and full-stack engineering (solo) |
| **Stack** | Tauri v2 · Rust service core · React + TypeScript UI |
| **Platforms** | Linux · macOS · Windows (one codebase, CI builds all three) |
| **Links** | [README](../README.md) · source in this repo |

---

## The problem

Everyone with a laptop has the same three questions and no good place to ask
them: *Is my connection actually healthy? What's on my network? Where did my data
go?* The existing answers are all bad in different ways — a router admin page is
ugly, slow, and locked behind a login; command-line tools (`ip`, `arp`, `iw`)
are precise but demand you already know the incantations; and the consumer
"network scanner" apps are bloated, ad-riddled, or want admin rights and a
sign-up.

The opening was a **fast, honest, no-privileges desktop app** for a curious
non-expert: someone who wants a clear picture of their connection without a
manual or a root password.

---

## Discovery & constraints

Three findings shaped every later decision:

- **A connection is not a fixed thing.** People pull cables, hop between SSIDs,
  drift across bands. If the UI ever shows the *last* network instead of the
  *current* one, it's lying. So "always reflect the real path" became a hard
  requirement, not a nice-to-have — and it drove real architecture later.
- **Admin rights are a dead end.** Anything that needs `sudo` or a driver won't
  get installed. Every feature had to work with unprivileged, already-present
  OS facilities — which is a genuine engineering constraint, not just a UX
  preference.
- **Calm beats busy.** A monitor that flickers and spikes reads as broken even
  when it's correct. The product had to feel quiet and trustworthy while still
  being live.

---

## Design decisions

Four choices, each with a tradeoff I accepted on purpose:

1. **One tab per job, not one tab per data source.** Navigation maps to
   questions — Home, Interfaces, Devices, Usage, Diagnostics
   (`src/navigation/`, `src/views/`) — so a user never has to know which system
   API answers their question. Tradeoff: some data appears in more than one place;
   I duplicated rather than force people to hunt.
2. **Missing data renders as "—", never as an error or a spinner-forever.**
   Platforms differ (macOS won't hand over an SSID without permission), so any
   value can be absent. Showing a neutral dash keeps the layout stable and the
   app honest. Tradeoff: less alarming, but also less "loud" about gaps.
3. **Live but calm.** Throughput samples once a second and is smoothed with an
   exponential moving average before it ever hits the screen, so the number
   informs instead of jitters. Tradeoff: a fraction of a second of lag against a
   spike, in exchange for a readout you can actually read.
4. **Ratings over raw numbers.** A speed test doesn't just print "312 Mbps" — it
   answers "can this do 4K? cloud gaming?" via per-activity thresholds
   (`src/components/capabilities/`). Tradeoff: an opinion baked into the UI, which
   is exactly what a non-expert wants.

---

## Building it

Rove is **two programs talking over a typed bridge**. A React UI owns
presentation; a pure-Rust core (`crates/rove-core/`) owns every platform service;
a thin Tauri shell (`src-tauri/src/lib.rs`) exposes each service as one command.

The decision that paid off most was making the **UI↔backend contract explicit and
mirrored**: TypeScript types in `src/types/` define every payload, and the Rust
structs in `crates/rove-core/src/types.rs` mirror them field-for-field (serde
renames to camelCase on the wire). The UI talks to a `window.networkAPI`
interface and never knows it's speaking to Rust.

That contract enabled a second, quietly important choice: a **browser mock
bridge** (`src/dev/`) implements the same interface, so `npm run dev` runs the
whole UI in a plain browser with fake data. Most design and layout work happened
with zero Rust in the loop and instant hot-reload — a *velocity* decision as much
as an engineering one. It's why the UX could iterate quickly against a slow,
platform-specific backend.

---

## One slice, end to end

The clearest place UX and code meet is **instant network-change detection** — the
"a connection is not a fixed thing" finding, made real.

- **User need.** When you pull the cable or join Wi-Fi, the app must *already*
  reflect it. State that lags reality erodes trust in everything else on screen.
- **Design.** The connection card should update within ~1 second of any change —
  fast enough to feel like the app is watching, not polling.
- **Implementation.** A naive version re-reads the routing table every 15 s;
  that's the fallback. On Linux the backend instead watches `ip monitor route`
  and pushes a `network-changed` event the moment the kernel's default route
  changes; the UI re-reads on that event rather than waiting for the next poll.
  macOS and Windows lack the equivalent stream, so they **degrade gracefully** to
  the 15 s poll — the same UI, just less instant. The push path is one of three
  events (alongside `live-throughput` and `speed-test-progress`) that flow from
  backend to UI; everything else is request/response.

One requirement, traced from a user's felt experience to a specific system call —
and to an honest fallback where the platform can't deliver it.

---

## Outcome & next

Rove ships as a single codebase producing native bundles for all three desktop
OSes from CI (`.github/workflows/build.yml`): a ~5 MB `.deb`, an AppImage, a dmg,
and an NSIS installer. Platform differences are runtime `cfg!()` branches, so
every path typechecks on every OS.

**What I'd do next:** an on-device history view for usage trends, per-device
labels the user can edit, and an accessibility pass on the live charts.

**What it demonstrates:**

- Product judgment — turning three vague user questions into a focused, opinionated tool.
- Systems engineering — unprivileged network discovery, event streaming, and a typed cross-language contract.
- Craft under constraint — one UI that stays honest and calm across three platforms with uneven capabilities.

---

## How to reuse this template

Copy this file and refill each section — its job is fixed, the content is yours:

- **At a glance** — the scannable facts: what, your role, stack, platforms, links.
- **The problem** — who it's for and why existing options fail. No solution yet.
- **Discovery & constraints** — the 2-4 findings that shaped everything after.
- **Design decisions** — 3-4 concrete choices, *each with the tradeoff you accepted*. Tradeoffs are what make it read as judgment, not decoration.
- **Building it** — the one or two architectural decisions that mattered most, with real file paths.
- **One slice, end to end** — pick a single feature and trace it: user need → design intent → implementation → fallback. This is where UX and code visibly meet; don't skip it.
- **Outcome & next** — what shipped, what you'd improve, and 2-3 bullets on what the project proves about you.
- Keep it to ~700-1000 words and cite real code — specificity is the whole point.
