# Rove frontend

How the React UI in `src/` is organised and styled, and which component to use
for what. Read it before writing or changing UI. For where files live, see
[Layout](../README.md#layout) in the README.

## State: context, not prop drilling

- No component takes a prop only to pass it down. App-wide state comes from
  context, read where it's used: `useNavigation()` (location, `navigate`,
  `back`), `useTheme()`, `useNetwork()` (network info), `useInternetStatus()`
  and `useConnectionStatus()` (the title bar's verdict). Each has its own small
  context, so a reader re-renders only when its value changes. That's why every
  view renders with no props.
- Backend data comes from TanStack Query. Each feature owns its data hook in
  `hooks/` (`useDevices`, `useDataUsage`, …), built on `useQuery` through
  `useBackendQuery`, and the components that show the data call it directly.
  Callers of the same hook share one cache entry, so `DevicesView` and
  `DevicesCard` see the same scan.
- A query key names the data, plus the network for data that belongs to one
  (`['devices', networkKey]` from `useNetworkKey()`), so a new network gets
  fresh results. A query fetches while a screen that shows it is open and polls
  per its hook; the hooks' comments say when and why.
- Props are for a component's own inputs: the item a row shows, a dialog's
  `onClose`. Shared components in `src/components` take only props and never
  read app context.

## Where code goes

- `app/` and every feature use the same subfolders: `components/`,
  `context/` (providers and their context objects), `hooks/` and `utils/`.
  Only a context's provider and hook import its object; everything else calls
  the hook. `npm run lint` enforces it.
- A custom hook lives in its own file in a `hooks/` folder, never inside a
  component file.
- A view file holds the page and its layout; the rows, cards and widgets it is
  built from go in the feature's `components/`, and the logic behind the copy
  (names, ages, grouping) in `utils/` as plain functions.
- An element that animates out stays mounted through its leave animation with
  `usePresence(isActive, exitMs)` (`hooks/usePresence.ts`), styled as leaving
  while `isActive` is false, rather than `{isActive && …}`.
- `src/types` is only the backend contract, mirrored in Rust. A type only the
  UI uses lives next to the code that owns it, such as
  `features/speed/types.ts`.
- The rare stylesheet a component needs sits next to it with the same name:
  `ConnectionCard.tsx` and `ConnectionCard.module.css`.
- File names say what a file is. A component is PascalCase (`ThemeProvider.tsx`),
  a hook is camelCase starting with `use` (`useTheme.ts`), and everything else
  is kebab-case: contexts, utils and types (`theme-context.ts`), global
  stylesheets (`base.css`) and folders (`live-throughput/`). `npm run lint`
  runs `scripts/check-file-names.mjs`, which fails on a name that fits none.

## Tests

Pure logic in `utils/` and `lib/` has unit tests beside it, named after its
module plus `.test` (`chart-scale.test.ts`). They run in Node with Vitest
(`npm test`, part of `npm run check`) and never touch the DOM or the bridge, so
keep logic worth testing out of components and hooks.

## Styles: Tailwind utilities from the design tokens

- Components are styled with Tailwind v4 utilities in the TSX. The theme in
  `src/styles/tailwind.css` is built only from the tokens, so `p-12` is
  `--spacing-12`, `text-md` is `--font-size-md` and `bg-panel` is `--bg-panel`;
  there are no Tailwind defaults to reach for. There's no preflight:
  `styles/base.css` is the reset.
- Shared type styles and layout (`text-meta`, `field-label`, `num`, `surface`,
  `page`, `page-header`, `error-banner`, …) are `@utility` definitions in
  `styles/utilities.css`. They take variants and sort with the other
  utilities.
- Variants go through CVA (class-variance-authority), with utility strings. An
  element whose classes depend on state or a variant gets a recipe at the top
  of its file:

  ```ts
  const rowVariants = cva('flex items-center gap-12', {
    variants: {
      isGateway: { true: 'bg-inset' },
      level: { good: 'text-good', poor: 'text-poor' },
    },
  })
  // <div className={rowVariants({ isGateway, level })}>
  ```

- `cn()` (`lib/cn.ts`) joins classes and lets a later utility override an
  earlier one that sets the same thing; use it wherever a component merges a
  `className` from outside, which is how a view adjusts a child. `cx` only
  joins fixed classes. `cn` lists every theme name so tailwind-merge can group
  them; when you add one to `tailwind.css`, add it there too.
  `npm run lint` runs `scripts/check-cn-theme.mjs`, which fails until you do.
- Shared components keep a plain marker class on their parts (`data-row`,
  `ui-section-footer`, `inline-meta-item`) so a view can adjust them from
  outside: `[&_.ui-section-footer]:pt-12`.
- Buttons are `Button` (`variant`: `primary`, `filled`, `secondary`) and
  `IconButton` (`tone`: `plain`, `primary`, `secondary`, `stop`; `aria-label`
  is required), never hand-written `<button>` classes.
- Animations are theme entries in `tailwind.css` (`animate-menu-in`), with
  their keyframes. A `.module.css` file is only for what utilities can't say:
  selectors into another component's DOM keyed on `:has()`. `npm run lint`
  also runs `scripts/check-css-modules.mjs`, which fails on a `styles.x` with
  no matching class and on a class nothing uses.

## Design and tokens

The [Rove Design System](https://www.figma.com/design/NoICIoyhWNOya9tOnNfEhH/Rove-Design-System)
in Figma is the source of truth for tokens and components. The UI consumes its
tokens through the `@swiftsolve/rove-design` package. To browse it without
Figma, see the published slideshow: <https://swiftsolve.github.io/rove-design/>.

Which token to use for what, with every value, is in the package's
`DESIGN.md` (`node_modules/@swiftsolve/rove-design/DESIGN.md`).

## Components

Each Figma component has a counterpart in the code; build from these before
writing new markup. Icons come from `src/components/icons/Icons.tsx`
(`<HomeIcon />`, the brand mark is `<BrandIcon />`); don't draw new ones inline.

| Figma | Code | Use |
| --- | --- | --- |
| Title bar | `StatusBar` | Brand, connection status and window controls. 56px tall (`--titlebar-height`). |
| Status link | `StatusBar` | Connection status in the title bar: On, Bad (no internet) or Off. |
| Window button | `StatusBar` | Minimise and close. Close hovers to `--window-close-hover`. |
| Nav rail | `TabBar` | One item per page; the current page's is active. Sun icon in Dark, moon in Light. |
| Nav item | `TabBar` | A 38px rail button (`--rail-item-size`). Active adds an `--accent-muted` tint and a bar on the edge. |
| Page header | `ViewHeader` | Top of every page except Home: icon chip, title, subtitle and actions, over a full-width divider. |
| Button | `Button` | Filled (`variant="filled"`) for the main action, Stop (`filled` with `isStop`) to cancel it, Secondary (`secondary`) for quiet actions, Text (`primary`) for low-key prompts like Install & restart. |
| Icon button | `IconButton` | Icon-only button; `tone` is `plain`, `primary`, `secondary` or `stop`. Use a 14px icon for Play. |
| Toggle | `Toggle` | On/off switch for settings. |
| Live badge | `LiveThroughputPanel` | Shows that traffic is updating live. |
| Section header | `Section` | 44px card header with an optional badge (`SectionBadge`) or button. |
| Data row | `DataRow` | Label and value; the value right-aligns. |
| Metric | `MetricValue` | A number with its unit. |
| Speed readout | `SpeedReadout` | Live download or upload speed. |
| Usage readout | `StatReadout` | Total data downloaded or uploaded. |
| Throughput chart | `ThroughputChart` | Last 60 seconds of download (solid) and upload (dashed). |
| Sparkline | `Sparkline` | Recent latency for a service row, coloured by health. Down is a flat `--status-negative` baseline. |
| Signal bars | `ConnectionCard` | Wi‑Fi strength. Unlit bars use `--opacity-unlit`. |
| Capability cell | `CapabilityMeter` | Icon tile over a 4-step meter. Use None when unsupported, not yet tested, or testing. |
| Connection card | `ConnectionCard` | Current connection: Wi‑Fi, Ethernet or Disconnected. Expands to show details. |
| Traffic card | `LiveThroughputPanel` | Live download and upload with the last 60 seconds charted. |
| Capabilities card | `CapabilityStrip` | What the connection can handle: a placeholder before a test, Testing while one runs, results after. |
| Stat card | `StatCard` | Home summary card: Usage or Devices. |
| Tooltip | `Tooltip` | Short hint on hover. One line where possible. |
| Error banner | `NetworkErrorBanner` | A failure the user can retry, with Retry and dismiss buttons. |
| Empty state | `EmptyState` | Blank page: icon, title, hint and an optional action. |
| Spinner | `Spinner` | Loading indicator, in `--accent-default`. |
| Ring spinner | `ButtonSpinner` | Loading indicator inside buttons, in the button's icon colour. |
