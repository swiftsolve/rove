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
- Each tab's label, rail icon and placement, screen and subpages are one entry
  in `TABS` (`app/utils/tab-registry.ts`); `TabBar` and `CurrentScreen` read
  it. A new tab is its id in `app/utils/tabs.ts` plus that entry.
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
  `--spacing-12`, `text-md` is `--font-size-md` and `bg-surface` is `--bg-surface`;
  there are no Tailwind defaults to reach for. There's no preflight:
  `styles/base.css` is the reset.
- Colours and easings are always tokens, and so is any length, weight or
  duration a token has: `p-12`, not `p-[12px]`. `npm run lint` runs
  `scripts/check-raw-values.mjs`, which fails on a raw one. A value that has
  to stay (the QR code's white plate) goes in its `ALLOWED` list, with why.
- Shared type styles and layout (`text-caption`, `text-overline`, `num`, `surface`,
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
- A view adjusts a shared component through its props: a variant
  (`density`, `align`, `shouldTruncate`) or the `className` of one of its
  parts (`CardBody`, `CardFooter`), never a selector into its DOM
  (`[&_.some-part]:pt-12`). A tweak more than one view needs becomes a
  variant. The one exception is a `:has()` selector in a `.module.css` (below);
  InlineMeta keeps its `inline-meta` and `inline-meta-item` classes for it.
- Buttons are `Button` (`variant`: `filled`, `danger`, `secondary`) and
  `IconButton` (`variant`: `secondary`, `plain`), never hand-written
  `<button>` classes. Both take an `icon` component (`icon={RefreshIcon}`)
  and draw it at the Figma size: 13px in a Button, 16px in an IconButton
  (`iconSize={14}` for Play). `isLoading` swaps the icon for the ring spinner
  and `isDisabled` dims; both drop clicks and stay focusable (so a tooltip can
  say why). An IconButton's `label` names it and is its tooltip; `tooltip`
  replaces the bubble's text when it should say more (a help button's hint).
  Both share that behaviour through `components/utils/button-state.ts`.
- Props share names across components and with Figma: `variant`, `isLoading`,
  `isDisabled`, `isChecked`; the text under a title is `description` and the
  controls a component holds are `actions`; a colour by role is `status` or `tone`
  (`positive`, `warning`, `negative`, `neutral`); a quality rating is `level`
  (`excellent`, `good`, `fair`, `poor`).
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
| Title bar | `TitleBar` | Brand, connection status and window controls. 56px tall (`--titlebar-height`). |
| Status link | `TitleBar` | Connection status in the title bar. `tone` (`positive`, `negative`, `neutral`) sets the colour, the label the words. |
| Window button | `TitleBar` | Minimise or close (`action`). Close hovers to `--status-negative-fill`. |
| Nav rail | `TabBar` | One item per page; the current page's is active. Sun icon in Dark, moon in Light. |
| Nav item | `TabBar` | A 38px rail button (`--rail-item-size`). Active adds an `--accent-muted` tint and a bar on the edge. |
| Page header | `PageHeader` (`icon`) | Top of every page except Home: icon chip, title, `description` and `actions`, over a full-width divider. `status` ("Checking…") takes the description's place while something runs; the description fades in when it clears. |
| Subpage header | `PageHeader` (`onBack`) | Top of a page layered over a tab: a back button in the icon's place, title, an optional description and actions. |
| Button | `Button` | Filled (`variant="filled"`) for the main action, Danger (`danger`) to stop it, Secondary (`secondary`) for everything else. Icon (`icon`) and Loading (`isLoading`) as in Figma. |
| Icon button | `IconButton` | Icon-only button with a tooltip (`label`, or `tooltip` for a hint); `variant` is `secondary` or `plain`. `iconSize={14}` for Play. |
| Toggle | `Toggle` | On/off switch for settings. |
| Live badge | `TrafficCard` | Shows that traffic is updating live. |
| Section header | `Card`, `CardHeader` | A card is `Card` with a `CardHeader` (44px: icon, title, and `actions` such as a `CardBadge` or a button), a `CardBody` and an optional `CardFooter` band. `Card as="li"` or `as="div"`, with no header, is the bare surface for a card that lays out its own content. |
| Data row | `DataRow`, `DataList` | Label and value; the value right-aligns. An optional accessory (signal bars, an icon) and detail sit before it, 6px apart. `DataList` makes the rows a `<dl>` and sets their `density` (`default`, `snug`, `compact`); `align="center"` suits a value with no text baseline. |
| Separator | `DotSeparator`, `InlineMeta` | A dot between inline items. Never type a middle dot. `shouldTruncate` keeps them on one line, each ellipsizing. |
| Metric | `MetricValue` | A number with its unit, coloured by `status` when it's earned. |
| Readout/Large | `SpeedReadout` | Live download or upload speed. |
| Readout/Compact | `StatReadout` | Total data downloaded or uploaded. |
| Throughput chart | `ThroughputChart` | Last 60 seconds of download (solid) and upload (dashed). |
| Sparkline | `Sparkline` | Recent latency for a service row, coloured by `status`. Down is a flat `--status-negative` baseline. |
| Signal bars | `ConnectionCard` | Wi‑Fi strength. Unlit bars use `--opacity-tint-lg`. |
| Capability cell | `CapabilityMeter` | Icon tile over a 4-step meter. Unsupported also covers not yet tested and testing. |
| Connection card | `ConnectionCard` | Current connection: Wi‑Fi, Ethernet or Disconnected. Expands to show details. |
| Traffic card | `TrafficCard` | Live download and upload with the last 60 seconds charted. |
| Capabilities card | `CapabilitiesCard` | What the connection can handle: a placeholder before a test, Testing while one runs, results after. |
| Stat card | `StatCard` | Home summary card: Usage or Devices. Devices is Empty when there's nothing to list. |
| Tooltip | `Tooltip` | Short hint on hover. One line where possible. |
| Dialog | `Dialog` | Modal: title, optional description, a recessed body, Cancel and the main action. Keep it mounted with `usePresence(isOpen, DIALOG_EXIT_MS)` so it animates out. |
| Error banner | `ErrorBanner` | A failure above a page: title, a line under it (required), then Dismiss and Retry on the right. Retry shows Retrying… until it settles. |
| Empty state | `EmptyState` | Blank page: two faded placeholder rows (with a lock badge when `isLocked`), title, `description` and optional `actions`. |
| Spinner | `Spinner` | Loading indicator, in `--accent-default`. |
| Ring spinner | `ButtonSpinner` | Loading indicator in the button's icon colour. Button and IconButton show it for `isLoading`; use it directly only outside a button. |
