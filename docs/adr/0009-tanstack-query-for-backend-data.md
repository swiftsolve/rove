---
status: accepted
date: 2026-11-07
---

# Backend data lives in TanStack Query, keyed by network; streams in module stores

Every read from the bridge is a TanStack Query hook owned by its feature
(`useDevices`, `useDataUsage`), so components that show the same data share
one cache entry and one fetch, and a query runs only while a screen that
shows it is open. Data that belongs to a network carries `useNetworkKey()` in
its key, so a new network starts fresh. Live throughput and the speed test
are event streams, not reads: each keeps a module store read with
`useSyncExternalStore`.

## Considered options

- **Fetching in components or a global store.** Each screen would re-implement
  caching, deduping, polling and staleness, and a network change would leave
  old results showing.
