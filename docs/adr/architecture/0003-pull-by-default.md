---
status: accepted
date: 2026-11-07
---

# The UI pulls; Rust pushes only what the UI can't ask for

Data moves by command (about thirty, one per thing a screen needs), fetched
and cached with TanStack Query. Only seven events push the other way, each
because it's continuous, arrives mid-call, or starts outside the app:
`live-throughput`, `speed-test-progress`, `network-changed`,
`internet-status`, `services-timeline`, `app-usage` and `host-usage`. The last
two carry no payload: they only nudge the UI to refetch. Push costs
subscription, teardown and late-event races, so it stays rare.

## Consequences

- **`network-changed` carries no payload.** It tells the UI to rerun the fetch
  it already has, so a cable pull shows within a second without a second data
  path to keep in sync; the 15 s poll stays as the safety net.
- **A stream is switched on by a pull.** `subscribe_live_throughput` flips a
  flag, so an unwatched window does no 1 Hz work.
