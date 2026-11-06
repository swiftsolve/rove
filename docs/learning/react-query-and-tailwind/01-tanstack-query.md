# TanStack Query

Part 1 of [Learning Rove's UI](README.md).

[← Contents](README.md) · [Tailwind and the design tokens →](02-tailwind-and-tokens.md)

## The problem it solves

The UI asks the Rust backend for data: the devices on your network, your
services, your data usage. Each ask is an `invoke` over the bridge and takes a
moment. Take the device list. Two places show it:

- the **Devices card** on Home ([DevicesCard.tsx](../../../src/features/home/components/DevicesCard.tsx))
- the **Devices screen** ([DevicesView.tsx](../../../src/features/devices/DevicesView.tsx))

Both call the same hook, `useDevices()`. Without a shared cache, each would
keep its own copy in `useState` and you'd hit these problems:

1. **Two scans for one list.** Each component asks the backend separately.
2. **A blank screen on return.** Leave Devices and come back, and the list
   starts empty and spins again, though you saw it a second ago.
3. **Out of step.** One finishes a rescan, the other still shows the old list.
4. **Hand-written plumbing everywhere.** Each hook needs its own "is a request
   already running?" flag, its own polling timer, its own "pause while the
   window is hidden", its own "ignore a late answer". The old network-info
   hook did all this by hand, in about 150 lines.

TanStack Query is a **cache with rules**. You name a piece of data with a
**query key** and give it a function that reads it. Everything that asks for
the same key shares one entry:

```ts
useBackendQuery({
  queryKey: ['devices', networkKey],    // the name in the cache
  queryFn: () => scanDevices(api),      // how to read it
  isEnabled: networkKey != null,        // wait until the network is known
  errorMessage: 'Couldn’t scan for devices',
})
```

Now Home and Devices share one scan. Come back to a screen and the last result
shows at once while a fresh one loads. A rescan updates both.

## What Rove gets from it, with examples

| What | Where you see it |
| --- | --- |
| One shared result per key | `DevicesCard` and `DevicesView` share `['devices', networkKey]` |
| Results kept between visits | `gcTime: Infinity` in [query-client.ts](../../../src/app/utils/query-client.ts): nothing is thrown away while the app runs |
| No duplicate requests | A rescan that lands during a poll joins the one already in flight |
| Polling that pauses when hidden | `pollIntervalMs` on events, interfaces, service reachability and usage |
| "Same answer, same object" | Network info keeps its old object when a poll reads the same thing, so nothing re-renders |
| Refresh other data after a change | A finished speed test calls `invalidateQueries({ queryKey: SPEED_HISTORY_KEY })`, and the history refetches |
| A new network gets fresh data | The key includes the network (`['devices', networkKey]`), so a new Wi-Fi starts a new entry |

## What Rove switched off

TanStack is built for websites talking to servers over the internet. Rove talks
to its own backend on the same machine, so some defaults make no sense here.
[query-client.ts](../../../src/app/utils/query-client.ts) turns them off:

- **`retry: false`.** A failed local read is a real answer. Show it; the next
  poll or the Retry button tries again.
- **`networkMode: 'always'`.** By default TanStack pauses when the machine is
  offline. For a network monitor, offline is exactly when you need it working.
- **`refetchOnWindowFocus` / `refetchOnReconnect` off.** Clicking back into the
  window shouldn't rescan everything.

## Rove's wrapper: `useBackendQuery`

Most hooks don't call `useQuery` directly. They go through
[useBackendQuery.ts](../../../src/hooks/useBackendQuery.ts), which adds the app's
rules on top:

- **Open.** Data refetches when a screen showing it opens, but only if it's
  older than `freshForMs`. Going Home → Devices right after Home loaded doesn't
  scan twice. Coming back after a while does. (`freshForMs` is TanStack's
  `staleTime` under a plainer name. It defaults to the poll interval, else 10s.)
- **Busy.** `isBusy` is true for the first load, the refetch when a screen
  opens, and a Retry. It is never true for a background poll, so the spinner
  doesn't flash every few seconds.
- **Errors.** A failed poll keeps the last data on screen and reports the
  error beside it. An old error is hidden while the screen's opening fetch runs.

A feature's hook stays tiny. Here is all of
[useNetworkInterfaces.ts](../../../src/features/interfaces/hooks/useNetworkInterfaces.ts)'s
data logic:

```ts
const { data, isBusy, error, reload } = useBackendQuery({
  queryKey: ['interfaces'],
  queryFn: api ? () => api.getInterfaces() : undefined,
  isEnabled: true,
  errorMessage: 'Couldn’t load interfaces',
  pollIntervalMs: POLL_INTERVAL_MS,
})
```

## What doesn't use it, and why

TanStack Query is for **asking and getting an answer**. Two things in Rove
aren't that:

- **Live throughput** is a stream: the backend pushes a sample every second.
  There's nothing to ask for.
- **The speed test** is a long job with progress messages, a Stop button and
  live peaks, and it must survive you switching tabs mid-test.

Each of those keeps a small store of its own
([useLiveThroughput.ts](../../../src/features/live-throughput/hooks/useLiveThroughput.ts),
[useSpeedTest.ts](../../../src/features/speed/hooks/useSpeedTest.ts)), read with
React's `useSyncExternalStore`.

The backend pushes three more events, and those do go through queries, because
each one updates data you can also ask for:

- **Internet status** sends a new verdict. It's written straight into its
  query's cache with `setQueryData`
  ([useInternetStatusSource.ts](../../../src/features/connection/hooks/useInternetStatusSource.ts)):
  the query reads once, and the pushes keep it current.
- **Services timeline** and **network changed** carry nothing. They're nudges:
  the timeline invalidates its query
  ([useServiceHistory.ts](../../../src/features/services/hooks/useServiceHistory.ts)),
  and a network change reruns the reads that already exist
  ([useOnNetworkChanged.ts](../../../src/hooks/useOnNetworkChanged.ts)).

## Was it worth it?

Without it, Rove would hand-write a cache, request sharing, polling and
refresh-after-change for about 15 data sources. That's more code than the
wrapper, and easy to get subtly wrong. The cost is about 13 kB gzipped and one
wrapper to learn. With three data sources it wouldn't pay off. With fifteen,
shared and polled, it does.

---

---

[← Contents](README.md) · [Tailwind and the design tokens →](02-tailwind-and-tokens.md)
