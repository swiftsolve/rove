# Rove — a desktop network monitor that tells the truth in real time

> **Case study · Product Engineering**
> Role: Solo — product, design, and engineering · Stack: Rust · Tauri v2 · React · TypeScript
> _[Fill in: timeline · link to repo/demo · your name]_

---

## The one-line version

**Rove is a fast, minimal desktop app that shows you the honest, live state of your network** — what you're connected to, what's on your LAN, and how good the connection actually is — and it stays correct the instant anything changes.

The product bet the whole app is built around: **network state should never feel stale.** Pull an Ethernet cable or hop to a new Wi-Fi network and most tools lie to you for a few seconds. Rove updates within about a second, because being *currently true* is the entire point of a monitor.

---

## The problem

A modern connection isn't one fixed thing. You pull a cable, join a new SSID, drift between bands, walk from one router to the next. Existing tools treat the network as static and poll on a slow timer, so they're routinely wrong right when you're looking — exactly when something changed and you opened the app to find out why.

And the deeper questions are genuinely hard to answer without admin rights or a driver install:

- *What am I actually connected through right now?*
- *What's on my network, and what is each thing?*
- *Is this connection good enough for a video call / 4K / cloud gaming?*

Rove answers all three in a small, always-on window — and keeps the answers current as you roam.

---

## What I shipped

A cross-platform desktop app (Linux, macOS, Windows) with five focused views:

| View | What it answers |
|---|---|
| **Home** | Live throughput + what you're connected through, updated the second it changes |
| **Devices** | Every device on your LAN, named and classified — no admin rights |
| **Speed test** | Real download/upload/latency, rated against real activities (calls, 4K, gaming) |
| **Usage** | Per-day data usage that survives restarts |
| **Diagnostics** | Gateway health, packet loss, DNS in use |

Roughly **21k lines** across a pure-Rust service core and a React UI, talking over a typed bridge. One person: the product calls, the interaction design, and the systems work.

> **[Visual slot — add later]** A short GIF here of the connection card updating the instant a cable is pulled is the single most persuasive asset for this page. Second choice: the live-traffic graph, or a LAN scan resolving into named devices.

---

## Three decisions worth showing

Product engineering is judgment under tradeoffs. Three I owned:

### 1. Make "current" the product, not a feature

Instead of polling every 15 seconds, the backend *watches* the OS routing table (`ip monitor route` on Linux) and re-reads the source of truth the moment anything changes, nudging the UI within ~1 second. Slower platforms fall back to the poll and still work.

**The bet:** a monitor that's ever wrong isn't a monitor. The extra plumbing (a push channel alongside request/response) exists entirely to protect that feeling of trust. It's the decision the product's whole identity — and its name, *Rove* — rests on.

### 2. Answer a "hard" question with cheap signals, honestly

"What's on my LAN?" has no clean OS API. Rove fuses **seven unprivileged signals** — an ICMP sweep, a TCP probe, mDNS, SSDP/UPnP, reverse DNS, an HTTP banner grab, and NetBIOS — and reconciles them with a trust-weighted vote to name and classify each device in a couple of seconds, no admin rights required.

**The tradeoff I chose to be honest about:** a device that blocks ping *and* announces nothing can still hide. Rather than pretend to be exhaustive, the UI defers to the router's admin page as authoritative. Naming the limit is better product than hiding it.

### 3. Degrade gracefully instead of erroring

Every platform exposes this data through different tools, and any of them can be missing. The service layer treats a missing tool as *"no data,"* not a failure — a probe that can't run returns nothing and the next one is tried. Missing values render as a quiet "—", never a crash or a scary error. The app stays useful on a stripped-down machine.

**Why it matters:** utilities get judged in their worst moment — the weird laptop, the locked-down OS. Graceful degradation is what makes it feel trustworthy there.

---

## The polish layer

A lot of the work was the last 10% that makes a utility feel like a product, visible right in the commit history:

- Speed-test **Stop** settles the UI immediately instead of waiting for the backend to unwind.
- Services show a clear **"Down"** state rather than an ambiguous blank.
- Frameless, minimal chrome with a staggered entrance — quick and quiet, not chatty.
- Copy tuned deliberately — subtitles trimmed back to concise one-liners.

None of these were in a spec. They're the difference between "it works" and "someone cared."

---

## Constraints & scope discipline

- **Solo, cross-platform.** Platform differences are runtime checks, so every code path typechecks on every OS and CI builds all three bundles.
- **Small on purpose.** A ~5 MB installer; memory-safe Rust backend with no Node runtime in the UI process (Tauri v2 is deny-by-default — the webview can only call the specific commands I expose).
- **Known cost, stated plainly.** A speed test at multi-gigabit rates moves 1–2 GB of data — inherent to measuring throughput. Rather than hide it, the app warns you. Trust over polish.

---

## What I'd do next

- Turn the router-authoritative caveat into a feature: optional import from the router's device list to close the "hidden device" gap.
- History and alerting on the metrics that already stream (throughput, gateway loss) — the data pipeline is already there.
- A packaged auto-update channel so the small-and-fast promise survives distribution.

---

## Takeaway

Rove is a small product with one clear bet — *be true right now* — carried all the way through the architecture, the tradeoffs, and the last-10% polish. It's the case where I set the product direction and built the systems to honor it.

_[Add: repo link · live demo or download · your contact]_
