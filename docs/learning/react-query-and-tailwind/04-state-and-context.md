# State and context

Part 4 of [Learning Rove's UI](README.md).

[← `cva`, `cx` and `cn`](03-cva-cx-cn.md) · [How a library component is built →](05-library-components.md)

The rule: [apps/rove/src/README.md: State](../../../apps/rove/src/README.md#state-context-not-prop-drilling).

## Views take no props

A view is a whole screen: `DevicesView`, `SpeedView`. Rove renders the current
one from the tab registry, with nothing passed in
([tab-registry.ts](../../../apps/rove/src/app/utils/tab-registry.ts)):

```ts
export function renderScreen(location: AppLocation): ReactElement {
  const tab = TABS[location.tab]
  return createElement(tab.subScreen?.(location) ?? tab.Screen)
}
```

So the view asks for what it needs itself. The first line of
[DevicesView.tsx](../../../apps/rove/src/features/devices/DevicesView.tsx):

```tsx
export function DevicesView() {
  const { lastScan, isScanning, error, rescan } = useDevices()
```

Why bother: the other way is **prop drilling**. The app reads the network at
the top and hands it to the view, which hands it to the list, which hands it to
the row, so the row can read one field. Every component in between carries a
prop it doesn't use, and a new need deep down means editing every level above.
Reading where it's used keeps each component's props to what it really is: the
device a row shows, a dialog's `onClose`.

## The small contexts

A React **context** is a value a provider puts high in the tree, for anything
below to read. Rove's are in [apps/rove/src/app/context](../../../apps/rove/src/app/context), and
[App.tsx](../../../apps/rove/src/app/App.tsx) stacks the providers around the shell:

```tsx
<QueryClientProvider client={queryClient}>
  <NavigationProvider>
    <ThemeProvider>
      <NetworkProvider>
        <AppShell />
      </NetworkProvider>
    </ThemeProvider>
  </NavigationProvider>
</QueryClientProvider>
```

Each is read through a hook: `useNavigation()` (where you are, `navigate`,
`back`), `useTheme()`, `useNetwork()` (network info), `useInternetStatus()` and
`useConnectionStatus()`. A hook is a few lines
([useTheme.ts](../../../apps/rove/src/app/hooks/useTheme.ts)):

```ts
export function useTheme(): Theme {
  const theme = use(ThemeContext)
  if (!theme) throw new Error('useTheme must be used inside <ThemeProvider>')
  return theme
}
```

`use(ThemeContext)` is React 19's way to read a context (older code says
`useContext`). The `throw` turns a forgotten provider into a clear error,
instead of a `null` that crashes three files away. That's why a lint rule sends
everyone else to the hook rather than to `ThemeContext` itself.

Why several small contexts, not one "app state"? A component re-renders when
the context it reads changes. If network info and the theme shared one object,
every network poll would re-render everything that only wanted the theme.
[NetworkProvider.tsx](../../../apps/rove/src/app/context/NetworkProvider.tsx) keeps three
apart, and makes the title bar's verdict a new object only when it changes:

```tsx
  // Rebuilt only when the verdict changes, not on every network info update.
  const { tone, label, internet: verdict } = describeConnectionStatus(network.info, internet)
  const connection = useMemo(() => ({ tone, label, internet: verdict }), [tone, label, verdict])
```

## `navigate` moves focus for you

The Devices card on Home opens Devices with one call
([DevicesCard.tsx](../../../apps/rove/src/features/home/components/DevicesCard.tsx)):

```tsx
      onOpen={() => navigate({ tab: 'devices' })}
```

No focus code, on purpose. On every screen change,
[useScreenFocus.ts](../../../apps/rove/src/app/hooks/useScreenFocus.ts) focuses the new
page's h1, so a screen reader announces the page and Tab starts inside it.
Going back is the reverse: [return-point.ts](../../../apps/rove/src/app/utils/return-point.ts)
remembered which control opened the screen and how far the page was scrolled,
so Back lands on that control again, with its focus ring only if you got there
by keyboard.

Why bother: a keyboard user who opens a screen and comes back should be where
they left off, not at the top pressing Tab twenty times. Doing it once in
navigation means no screen has to remember. A screen that calls `focus()`
after `navigate` fights it, which is why review looks for that.

## Query keys per network

[Chapter 1](01-tanstack-query.md) covered TanStack Query. The context side of
it: data that belongs to one network puts the network in its key.
[useNetworkKey.ts](../../../apps/rove/src/app/hooks/useNetworkKey.ts) builds it from
`useNetwork()`:

```ts
export function useNetworkKey(): string | null {
  const { info } = useNetwork()
  return info ? `${info.interfaceName}|${info.ipAddress ?? ''}` : null
}
```

and [useDevices.ts](../../../apps/rove/src/features/devices/hooks/useDevices.ts) uses it:

```ts
  const { data, isBusy, error, reload } = useBackendQuery({
    queryKey: ['devices', networkKey],
    queryFn: api ? () => scanDevices(api) : undefined,
    isEnabled: shouldScanOnOpen && networkKey != null,
    errorMessage: 'Couldn’t scan for devices',
  })
```

Join another Wi-Fi and the key changes, so the screen starts a fresh entry
instead of showing the last network's devices as if they were here. While
network info is loading the key is `null` and the query stays off, so it
doesn't scan once without a key and again with one.

Notice there's no devices provider. The hook lives in the feature's `hooks/`,
and `DevicesView` and `DevicesCard` both call it. The shared cache entry is
what keeps them in step.

## Streams: a store and `useSyncExternalStore`

Live throughput pushes a sample every second, and the speed test is a long job
with a Stop button. Neither is "ask and get an answer", so neither is a query.
Each keeps a **module store**: a variable at the top of its file, a set of
listeners, and a setter that tells them. From
[useLiveThroughput.ts](../../../apps/rove/src/features/live-throughput/hooks/useLiveThroughput.ts):

```ts
let storeState: LiveThroughputState = INITIAL_STATE
const listeners = new Set<() => void>()

function setStoreState(next: LiveThroughputState): void {
  storeState = next
  for (const listener of listeners) listener()
}
```

React's `useSyncExternalStore` connects a component to it, given a way to
subscribe and a way to read the current value:

```ts
export function useLiveThroughput(): LiveThroughputState {
  return useSyncExternalStore(subscribeStore, () => storeState)
}
```

Why a module and not `useState`? The store outlives every screen. The Home
chart's last minute keeps filling while you're on Settings, and a speed test
keeps running when you switch tabs. State inside a component goes when the
component unmounts.

The speed test's reader takes a selector, so a component re-renders only when
its own piece changes
([useSpeedTest.ts](../../../apps/rove/src/features/speed/hooks/useSpeedTest.ts)):

```ts
export function useSpeedTest<T>(select: (test: SpeedTest) => T): T {
  return useSyncExternalStore(subscribe, () => select(snapshot))
}
```

`useSpeedTest((test) => test.completedAt)` in
[SpeedView.tsx](../../../apps/rove/src/features/speed/SpeedView.tsx) ignores the live
peaks that change many times a second while a test runs.

---

---

[← `cva`, `cx` and `cn`](03-cva-cx-cn.md) · [How a library component is built →](05-library-components.md)
