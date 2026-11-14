---
status: accepted
date: 2026-11-07
---

# The UI talks to one interface, which a browser mock can stand in for

Every screen reads from `window.networkAPI`, typed by `apps/rove/src/types/api.ts`. At
startup Rove installs either the Tauri bridge or a browser mock that fakes
time as well as data: calls resolve after a delay, throughput ticks, a speed
test ramps. So `npm run dev` runs a full UI in a plain browser, screenshots
come out the same on any machine without a real SSID, and the same build runs
as the live demo on the website.

## Consequences

- **The contract is kept by hand.** The TypeScript types and the Rust structs
  mirror each other with nothing checking it; a renamed Rust field compiles
  and reads `undefined`. Generating one side (`ts-rs`, `specta`) would close it.
- **The mock repeats one rule,** capability rating, so the demo rates like
  the app.
- **Desktop-only calls skip the bridge** (the app version, the updater):
  anything the UI renders goes through it; anything that only exists on a
  desktop doesn't.
