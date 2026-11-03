# Learning TanStack Query & Tailwind through Rove

A plain-words tour of two choices in Rove's UI: why backend data goes through
TanStack Query (often called React Query), and how styling works, from a Figma
token to a class like `p-12`, plus the three helpers `cva`, `cx` and `cn`.
Every example is real code you can open.

> **Companion pages:**
> - [Rove frontend](frontend.md): the rules, checklists and component table.
> - [How Rove Is Put Together](architecture.md): the bridge the data comes over.
> - [`DESIGN.md`](../../node_modules/@swiftsolve/rove-tokens/DESIGN.md) in
>   rove-tokens: which token to use for what.

---

## Part 1: TanStack Query

### The problem it solves

The UI asks the Rust backend for data: the devices on your network, your
services, your data usage. Each ask is an `invoke` over the bridge and takes a
moment. Take the device list. Two places show it:

- the **Devices card** on Home ([DevicesCard.tsx](../../src/features/home/components/DevicesCard.tsx))
- the **Devices screen** ([DevicesView.tsx](../../src/features/devices/DevicesView.tsx))

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

### What Rove gets from it, with examples

| What | Where you see it |
| --- | --- |
| One shared result per key | `DevicesCard` and `DevicesView` share `['devices', networkKey]` |
| Results kept between visits | `gcTime: Infinity` in [query-client.ts](../../src/app/utils/query-client.ts): nothing is thrown away while the app runs |
| No duplicate requests | A rescan that lands during a poll joins the one already in flight |
| Polling that pauses when hidden | `pollIntervalMs` on events, interfaces, service reachability and usage |
| "Same answer, same object" | Network info keeps its old object when a poll reads the same thing, so nothing re-renders |
| Refresh other data after a change | A finished speed test calls `invalidateQueries({ queryKey: SPEED_HISTORY_KEY })`, and the history refetches |
| A new network gets fresh data | The key includes the network (`['devices', networkKey]`), so a new Wi-Fi starts a new entry |

### What Rove switched off

TanStack is built for websites talking to servers over the internet. Rove talks
to its own backend on the same machine, so some defaults make no sense here.
[query-client.ts](../../src/app/utils/query-client.ts) turns them off:

- **`retry: false`.** A failed local read is a real answer. Show it; the next
  poll or the Retry button tries again.
- **`networkMode: 'always'`.** By default TanStack pauses when the machine is
  offline. For a network monitor, offline is exactly when you need it working.
- **`refetchOnWindowFocus` / `refetchOnReconnect` off.** Clicking back into the
  window shouldn't rescan everything.

### Rove's wrapper: `useBackendQuery`

Most hooks don't call `useQuery` directly. They go through
[useBackendQuery.ts](../../src/hooks/useBackendQuery.ts), which adds the app's
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
[useNetworkInterfaces.ts](../../src/features/interfaces/hooks/useNetworkInterfaces.ts)'s
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

### What doesn't use it, and why

TanStack Query is for **asking and getting an answer**. Two things in Rove
aren't that:

- **Live throughput** is a stream: the backend pushes a sample every second.
  There's nothing to ask for.
- **The speed test** is a long job with progress messages, a Stop button and
  live peaks, and it must survive you switching tabs mid-test.

Each of those keeps a small store of its own
([useLiveThroughput.ts](../../src/features/live-throughput/hooks/useLiveThroughput.ts),
[useSpeedTest.ts](../../src/features/speed/hooks/useSpeedTest.ts)), read with
React's `useSyncExternalStore`.

### Was it worth it?

Without it, Rove would hand-write a cache, request sharing, polling and
refresh-after-change for about 15 data sources. That's more code than the
wrapper, and easy to get subtly wrong. The cost is about 13 kB gzipped and one
wrapper to learn. With three data sources it wouldn't pay off. With fifteen,
shared and polled, it does.

---

## Part 2: Tailwind and the design tokens

### The chain, from Figma to a class

```
Figma variables          (the source of truth: colours, spacing, radii, type)
      ↓ exported and built by @swiftsolve/rove-tokens
tokens.css               --spacing-12: 12px;  --bg-surface: #151618;
      ↓ mapped by src/styles/tailwind.css (@theme)
Tailwind utilities       p-12   bg-surface   rounded-md
      ↓ used in components
<div className="p-12 bg-surface">
```

**Tokens** are named design values: `--spacing-12` is 12px, `--bg-surface` is
the card background. They live in Figma. The `@swiftsolve/rove-tokens` package
turns them into CSS variables in
[`tokens.css`](../../node_modules/@swiftsolve/rove-tokens/tokens.css). Nobody
edits that file by hand; it's generated.

**Tailwind** gives you small single-purpose classes: `p-12` means
`padding: 12px`. You build a look by combining them in `className`, instead of
writing a CSS file per component.

### Joining the two: `@theme`

[tailwind.css](../../src/styles/tailwind.css) tells Tailwind which classes
exist, using the tokens:

```css
@theme inline reference {
  --*: initial;               /* 1. throw away Tailwind's default theme */
  --spacing-12: var(--spacing-12);  /* 2. p-12, gap-12, m-12... use the token */
  --color-surface: var(--bg-surface); /* 3. bg-surface, text-surface... */
}
```

Line by line:

1. **`--*: initial`** deletes Tailwind's built-in values. There is no `p-7`, no
   `text-blue-500`, no `rounded-2xl`. If Figma doesn't have it, the class
   doesn't exist. You can't drift from the design by accident.
2. **`--spacing-12: var(--spacing-12)`** says "make spacing classes named `12`,
   with the token's value".
3. **`--color-surface: var(--bg-surface)`** makes `bg-surface`, pointing at the
   `--bg-surface` token.

The two words after `@theme`:

- **`inline`**: the class uses the token directly. `p-12` becomes
  `padding: var(--spacing-12)`. Without it, Tailwind would point at its own
  copy of the variable, and here that copy would refer to itself
  (`--spacing-12: var(--spacing-12)`), which breaks.
- **`reference`**: don't write these variables into the page again. The tokens
  file already defines them.

### Light and dark for free

The tokens file defines every colour twice:

```css
:root             { --bg-surface: #151618; }  /* dark */
:root.theme-light { --bg-surface: #ffffff; }  /* light */
```

`bg-surface` always means `var(--bg-surface)`. Switching the theme only flips
the `theme-light` class on `<html>`, and every colour in the app changes at
once. No component knows which theme it's in.

### Text styles: the `type-*` classes

Figma has text styles ("Heading small", "Body default", "Caption"). Each one is
a size, weight, line height and letter spacing that belong together.
rove-tokens ships each as a class in `text-styles.css`:

```tsx
<h2 className="type-heading-small">Devices</h2>
<p className="type-caption text-secondary">Updated 2m ago</p>
```

Use `type-*` for text. It keeps the four values matched, as Figma intended,
rather than combining `text-md leading-… tracking-…` by hand.

### The app's own shared styles: `@utility`

Some layouts repeat across screens, like a page's column with its gap and
entrance animation. Those live in
[utilities.css](../../src/styles/utilities.css) as Tailwind utilities:

```css
@utility page {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-10);
}
```

Then any screen writes `<div className="page">`. Hovering the class in VS Code
shows this CSS; to find it, search for `@utility page`.

### Two custom variants

Also in `tailwind.css`:

- **`hover:`** is plain `:hover`. (Tailwind's default only applies hover styles
  on devices with a mouse.)
- **`usable:`** means "not disabled and not loading". Write
  `usable:hover:bg-raised`, and a disabled button doesn't light up when
  hovered.

### Guard rails

`npm run check` stops you from slipping:

- `scripts/checks/raw-values.mjs` flags a raw colour (`#fff`, `rgb()`) and a
  value that has a token (`p-[12px]` is `p-12`, `text-[13px]` is `text-md`).
- `scripts/checks/ui-classname.mjs` stops a screen restyling a library component
  through `className`. It may place it (margin, width, grid position), not
  change its look. A new look is a new variant in the component.

---

## Part 3: `cva`, `cx` and `cn`

Three small helpers for building `className` strings.

### `cva`: a component's variants

`cva` (from `class-variance-authority`) describes a component's looks as data:
the classes every version shares, plus the classes for each option. From
[Badge.tsx](../../src/ui/badge/Badge.tsx):

```ts
const badgeVariants = cva('inline-flex items-center rounded-full px-8 py-4 type-badge', {
  variants: {
    tone: {
      positive: 'bg-status-positive/(--opacity-tint-md) text-positive',
      warning: 'bg-status-warning/(--opacity-tint-md) text-warning',
      negative: 'bg-status-negative/(--opacity-tint-md) text-negative',
    },
  },
})

badgeVariants({ tone: 'warning' })
// → 'inline-flex items-center rounded-full px-8 py-4 type-badge bg-status-warning/… text-warning'
```

Why bother: every option is listed in one place, TypeScript knows the allowed
values (`'positive' | 'warning' | 'negative'`), and the props match the Figma
component's variants one to one. Rove's catalogue
([components.json](../../src/ui/components.json)) reads these to document every
component.

### `cx`: just join

`cx` glues class names together and skips anything falsy:

```ts
cx('rounded-md p-12', isOpen && 'bg-raised')
// isOpen true  → 'rounded-md p-12 bg-raised'
// isOpen false → 'rounded-md p-12'
```

It doesn't understand what the classes do. `cx('px-12', 'px-8')` gives you
both, and which one wins depends on the order in the generated CSS, not on
which you wrote last.

### `cn`: join, and let the last one win

[`cn`](../../src/ui/foundations/cn.ts) is `cx` plus **tailwind-merge**, which
knows that `px-12` and `px-8` both set horizontal padding and keeps only the
last:

```ts
cn('px-12 py-4', 'px-8')  // → 'py-4 px-8'
```

This matters when a component accepts a `className` from outside:

```tsx
function Badge({ tone, className }) {
  return <span className={cn(badgeVariants({ tone }), className)} />
}

<Badge tone="warning" className="px-12" />  // the caller's px-12 replaces px-8
```

With `cx` instead, the element would get both `px-8` and `px-12`, and the
result would depend on CSS order.

`cn` has one catch. tailwind-merge has to know Rove's custom names, or it
mixes them up: it would read `text-md` (a size) and `text-secondary` (a colour)
as two colours and drop one. So `cn.ts` lists every theme name, and
`scripts/checks/cn-theme.mjs` fails if the list falls behind `tailwind.css`.

### Which one when

| You're writing | Use |
| --- | --- |
| A component with options (size, tone, layout) | `cva` |
| A component that takes `className` from outside | `cn(ownClasses, className)` |
| Fixed classes, maybe with a condition, nothing from outside | `cx` |

`cn` everywhere would work, but it costs a parse on every render, and seeing
`cn` should tell a reader "this component accepts overrides".

---

## Cheat sheet

- New backend read → a hook in the feature's `hooks/` calling `useBackendQuery`
  with a key that names the data (and the network, if it belongs to one).
- Something the backend pushes → a store with `useSyncExternalStore`, not a query.
- A new spacing, colour or size → add it in Figma, release rove-tokens, map it
  in `tailwind.css` (and `cn.ts`). Never a raw value in code.
- Text → a `type-*` class.
- A shared layout → an `@utility` in `utilities.css`.
- A component's looks → `cva`; merging an outside `className` → `cn`; plain
  joins → `cx`.
