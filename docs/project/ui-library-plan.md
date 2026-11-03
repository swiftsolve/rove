# UI library: audit and plan

## Status

**Done:** phases 0–6, 8 and 11, most of 7, and part of 9.
- `src/ui` is the library, behind lint boundaries. Its primitives/components
  split was later flattened to one folder per component, grouped by purpose
  in `index.ts`, the stories and `docs/develop/frontend.md` instead.
- Button has variant × tone × size on one pressable base. It was later cut
  to solid, soft and ghost, with a tone on solid only; the link variant became
  ViewLink, which always ends in a caret.
- These run on Base UI: Tooltip, Dialog, Menu, Toggle, SegmentedControl,
  Disclosure and TextField.
- New components: Badge, StatusDot, IconTile, LoadingState, ListRow,
  StretchedButton, BarMeter, Readout, NavRail and TitleBar.
- The Apps, Hosts and Traffic views are deduplicated.
- The audit's bugs are fixed, and fetching moved from effects into query hooks.
- A raw `<button>` outside the library is a lint error.
- `className` on a library component is placement only, and a lint check
  fails on a restyle. CardBody gained `layout`, Card `onOpen` (its own
  link and caret) and StatusDot `tone`; a padded `li` card lays out its
  content in its own element.
- Gates: DOM tests, `screenshots --stable` diffs and the a11y audit.
- Text takes rove-tokens' `type-*` classes, which set no colour, so the
  app's own colour-baked type utilities are gone.

**Left as follow-ups:**
- **Phase 7:**
  - Split Sparkline's geometry from its latency logic.
  - Make WavyProgress a library progress bar.
  - Make one Timeline marker for Events and the services timeline.
  - Promote TransferFigures and SplitBar from apps to the library.
- **Phase 9:**
  - Split the fat views (ServicesView, ServicesTimelineView, SpeedHistoryView,
    UsageView, DiagnosticsView, HostsView's rows).
  - Move their untested logic into tested `utils/`.
  - Memoise the timeline's per-second grouping.
- **Phase 6:**
  - Hand-built full-bleed footers (Speed history's banner, the capability
    verdict) should become CardFooter.
- **Design questions:**
  - Badge's tint is 15%, which no token has (the scale steps 14% to 22%).
    Move it to `tint-md`, or add a step?
- **Phase 10:**
  - Move component styles out of `utilities.css`.
  - Split colour out of the type utilities.
  - Add a page-inset layout token for PageHeader's bleed. It needs Figma and
    rove-tokens first.

Phase 1 of the component-library refactor. Nothing in `src/` has changed yet.
Work happens on `refactor/ui-library`.

Baseline for visual parity (commit `c7b0bb0`): 15 screens in each theme, plus
`npm run a11y` reporting 0 violations across 20 scenarios in both themes.

## 1. What's wrong today

### The library is too small, so features build their own

`src/components` has 14 components. Only two of them are interactive (Button
and IconButton). Everything else the app needs is written inline in features:

- **17 hand-written `<button>`s outside the library.** These include:
  - the nav items and window controls;
  - PageHeader's own back button;
  - three overflow menus;
  - five text-link buttons;
  - two "open" overlays on cards;
  - an accordion header and a segmented control;
  - list rows and a capability tile.
- **Three copies of the kebab menu.** They're in ServicesView,
  ServicesTimelineView and SpeedHistoryView, and they've already drifted apart:
  different colours, widths, enter animations, danger hover and `aria-expanded`
  styles. None of them has a tooltip.
- **Duplicate design-system pieces:**

  | Piece | Copies | Where |
  | --- | --- | --- |
  | 4-bar meter | 2 | CapabilityMeter, ConnectionCard's SignalMeter |
  | Icon chip/tile | 7 | Spread across features, at 30, 32, 36 and 40px |
  | Readout | 3 | SpeedReadout, UsageView's BytesMetric, StatReadout |
  | Connection badge | 2 | |
  | Timeline marker | 2 | |
  | Status dot | 6 | Two sizes, and three ad-hoc pulse durations |
  | Loading block | 8 | Three different a11y treatments, one with none |
  | `color-mix` tint | 15+ | Spelled out inline each time |

- **The Apps, Hosts and Traffic views are copy-paste.** They repeat the same
  rows, split bars, figures and body flow, and are backed by three line-for-line
  copies of the same hook.

### The primitives are coupled

- **Tooltip and IconButton.** Tooltip injects aria attributes and handlers into
  its child with `cloneElement`, and wraps it in a span that changes layout.
  IconButton hard-wires a Tooltip and re-exports its API (`tooltipSide`).
- **Dialog and the app.** Dialog finds its portal target with
  `document.querySelector('[data-modal-root]')`, so it only works inside
  AppShell. `useScrollToFocusedApp` does the same with `[data-scroll-root]`.
- **Dialog's Cancel button** reaches its size by overriding Button's classes
  (`CANCEL`). ErrorBanner rebuilds Retry and Dismiss the same way (`RETRY`,
  `DISMISS`).
- **Escape handling.** `useMenu` and `useModalFocus` both listen for Escape on
  `document` and neither stops it, so a menu inside a dialog would close both.
  The page behind an open dialog isn't made inert.
- **Component styles live in `utilities.css`.** `page-header`, `page-empty`,
  `surface`, `error-banner`, `metric*` and `chart-tip` are styled there.
  `page-header`'s negative margins hard-code AppShell's padding, and `page` and
  AppShell both select `.error-banner`.
- **Type utilities bake in a colour.** `text-caption`, for example, sets both
  type and colour, and `cn` can't merge those names. So
  `text-caption text-positive` resolves by CSS order, not by `cn`.

### Callers bend components from outside

The docs forbid this, but it's everywhere:

- **Selectors into a component's DOM:**
  - Card: `[&>li+li]:border-t`, `has-[>div>button:focus-visible]`
  - DataList: `[&>dl:not(:first-child)]`
  - EmptyState: `[&>button]:mt-8`
  - AppShell: `[&>.error-banner]`
- **Card padding** is overridden on most `as="li"` uses.
- **Full-bleed footers** are built by hand four times instead of using
  CardFooter. Two "inset bands" are faked with negative margins.
- **`DevicesCard`** gives Button `className="relative z-2 gap-4 px-8 -mb-4"`.

### Button and IconButton

| Problem | Where it shows |
| --- | --- |
| `variant` mixes emphasis, colour and size. `filled`/`danger` are 14px semibold with 10px padding; `secondary` is 12px medium with 6px. | No large secondary or small filled exists. Dialog fakes one, DevicesCard shrinks one, and the Test button in AddServiceDialog is hand-rolled. |
| No `tone`: danger is a whole variant. | Neutral, accent and negative can't be applied to the soft or ghost styles. ErrorBanner's tonal Retry and ghost Dismiss are className hacks. |
| No ghost or link variant. | Five hand-rolled link buttons, Dismiss, and the kebabs. |
| Every hover is `not-aria-disabled:not-aria-busy:hover:…`, repeated per variant. | Noisy and easy to get wrong. `data-disabled`/`data-loading` plus one `enabled:` custom variant would replace it. |
| Disabled only drops `onClick`. | Keyboard and pointer handlers still fire, and a `type="submit"` would still submit its form. There are no forms yet, which is why it hasn't bitten. AddServiceDialog fakes Enter with `onKeyDown`. |
| `iconSize={14}` exists for one icon (Play). | Optical sizing is the icon's job, not every caller's. |
| Two separate base recipes, stitched together with exported class strings (`button-state.ts`). | Button and IconButton can drift. There's no shared pressable base for nav items, list rows or menu items. |
| A loading button has no text for screen readers beyond `aria-busy`. Callers swap the label themselves (`isRetrying ? 'Retrying…' : 'Retry'`). | Inconsistent, and the width jumps when there's no icon. |
| Several call sites still use native `disabled`. | The Test button, capability tiles and list rows lose focus mid-action, and can't show a tooltip saying why. |

### Bugs and sloppiness found along the way

- **`useSetting` doesn't sync within one window.** It says it syncs across
  components, but it relies on `storage` events, which only fire in other
  windows. `useThemeState` reimplements the same storage.
- **AddServiceDialog has a stale closure.** A name typed while the test runs is
  dropped, and setState can run after unmount.
- **SpeedTestCard re-renders on every progress tick.** It subscribes to the
  whole store, which defeats its `memo`.
- **SpeedHistoryView keys rows by `${timestamp}-${index}`**, so a new result
  re-keys every row.
- **A `<div>` inside a `<button>`** in SettingsView, which is invalid HTML.
- **The text links remove the focus ring.**
- **`RestartAsAdminAction` calls `invoke` directly**, bypassing the typed bridge.
  WifiShareDialog, SpeedHistoryView, AddServiceDialog and the Settings update
  check also fetch in effects instead of query hooks.
- **Untested pure logic inside views:**
  - the services timeline's grouping and durations, which also run unmemoised
    every second;
  - Diagnostics' status rules;
  - ThroughputChart's scale.
- **Dead code:** `canRunSpeedTest`, the unused `connection-display` fields, and
  an unreachable icon fallback.
- **Non-null `!`** in Sparkline and the timeline.

## 2. Target

### Layout

The library moves to `src/ui`, with one public entry, `@/ui`. Today
`src/components` sits next to every feature's own `components/` folder, so the
name doesn't say which is the library. Moving it also gives it a clean edge to
lift out later.

```
src/ui/
  index.ts            the only import path features use: `@/ui`
  foundations/        cn, the `enabled:` variant, tints, motion, portal provider
  hooks/              usePresence, useEasedValue, useLatestRef, usePageVisible, useNow
  primitives/         behaviour + look atoms, one kebab folder each
    button/           Button.tsx, IconButton.tsx, button-recipe.ts, Button.test.tsx
    link/  tooltip/  dialog/  menu/  disclosure/  toggle/  segmented-control/
    text-field/  badge/  status-dot/  icon-tile/  spinner/  separator/
  components/         compositions of primitives
    card/  data-list/  page-header/  empty-state/  loading-state/  error-banner/
    list-row/  readout/  metric-value/  bar-meter/  sparkline/  progress-bar/
    split-bar/  timeline/  title-bar/  nav-rail/
  icons/
  gallery/            dev-only page rendering every component in every state
```

Lint enforces the layering:

- Nothing in `src/ui` imports from `app/`, `features/`, `bridge/` or `types/`.
- Features import only from `@/ui`, never `@/ui/primitives/...`.
- A raw `<button>` outside `src/ui` is a lint error.
- `check-file-names.mjs` learns `Name.test.tsx`.

### One API grammar

Every DOM-rendering component follows the same rules:

- It forwards `ref`, takes `className`, and spreads the rest of its props onto
  its root, typed from that element.
- Styles are CVA recipes with separate axes: `variant` (emphasis), `tone`
  (colour role) and `size`. Combinations Figma doesn't have are type errors,
  not silent fallbacks.
- State is exposed as data attributes (`data-disabled`, `data-loading`,
  `data-open`, `data-selected`), and styles key off them.
- Composition uses compound parts (`Menu.Trigger`, `Card.Header`) and a
  `render` prop for polymorphism. No `cloneElement`, no wrapper spans.
- Prop names follow docs/develop/frontend.md (`variant`, `tone`, `status`, `level`,
  `description`, `actions`, `isDisabled`, `isLoading`, …). Every rename is
  logged in `docs/figma-delta.md` for the Figma pass.

### Button, proposed

```tsx
<Button
  variant="solid" | "soft" | "ghost" | "link"   // emphasis; default "soft"
  tone="accent" | "neutral" | "negative"        // default per variant
  size="sm" | "md"                              // sm = today's secondary, md = today's filled
  icon={PlayIcon}                               // leading icon; sized by `size`
  iconEnd={ChevronRightIcon}                    // trailing icon (link carets)
  isLoading                                     // spinner replaces the icon, width holds
  loadingLabel="Retrying…"                      // optional: text while loading, announced
  isDisabled                                    // focusable, blocks every activation incl. submit
/>

<IconButton
  label="Refresh"                               // accessible name, and the tooltip
  icon={RefreshIcon}
  variant="soft" | "ghost"  tone=…  size="sm" | "md"
  tooltip={…}                                   // richer hint; `false` for none
/>
```

Allowed pairs: solid × accent or negative; soft × neutral, accent or negative;
ghost × neutral or negative; link × neutral or accent. Every current use maps
onto them:

| Today | Becomes |
| --- | --- |
| `variant="filled"` | `variant="solid" tone="accent" size="md"` |
| `variant="danger"` | `variant="solid" tone="negative" size="md"` |
| `variant="secondary"` / default | `variant="soft"` (neutral, sm) |
| Dialog Cancel (`CANCEL` hack) | `variant="soft" size="md"` |
| ErrorBanner Retry / Dismiss | `soft tone="negative"` / `ghost tone="negative"` |
| AddServiceDialog Test (hand-rolled) | `soft tone="accent"` |
| 5 text-link buttons | `variant="link" iconEnd={ChevronRightIcon}` |
| 3 kebabs, Dialog close | `IconButton variant="ghost"` |
| PageHeader back | `IconButton size="md"` (rail-item box) |
| `iconSize={14}` for Play | dropped; PlayIcon carries its own optical scale |

Button, IconButton, nav items, list rows and menu items share one pressable
base, so focus, press, disabled and loading behave the same everywhere.

### Behaviour: adopt a headless library (decision 1)

Tooltip (294 lines), the Dialog focus trap, `useMenu` and the Escape and inert
handling are all hand-rolled. Each has gaps: positioning is home-made, Escape
isn't stopped, nothing is made inert, and the outside-close only listens to
`mousedown`.

**Recommendation: Base UI.** Here's why:

- It's unstyled and actively maintained, from the Radix/MUI people.
- It covers every primitive on the list: Tooltip, Dialog, Menu, Collapsible,
  Toggle Group, Switch, Field/Input, and Button with `focusableWhenDisabled`.
- Positioning (flip and clamp) comes from Floating UI.
- It sets `data-*` state attributes, which the grammar above relies on.
- Its `render` prop composes without `cloneElement`.
- It takes a portal `container`, which replaces `[data-modal-root]`.

Its React peer range needs checking at install. The alternatives:

- **Radix:** the same model, but slower-moving.
- **Stay hand-rolled:** fix each gap ourselves, at roughly three times the
  code to own.

### Feature side

- **Apps, Hosts and Traffic** share `UsageRow`, `SplitBar`,
  `TransferFigures`, one body flow and one `useUsageList` hook.
- **TitleBar, TabBar, ThroughputChart and StatCard** become props-only UI
  pieces, with thin containers in their features that read context.
- **Fat views are split.** That covers ServicesView, ServicesTimelineView,
  ConnectionCard, SettingsView, SpeedHistoryView, HostsView, UsageView and
  DiagnosticsView. Page layout stays in the view, pieces move to `components/`,
  and logic moves to `utils/` with tests.
- **Effects that fetch become query hooks.** RestartAsAdminAction goes through
  the bridge.
- **The bugs listed above** each get fixed in the step that touches their file.

## 3. Phases

Each phase lands as several small commits. After every commit, `npm run check`
passes, the screenshot diff is clean in both themes, and `npm run a11y` passes.

| # | Phase | Ends with |
| --- | --- | --- |
| 0 | Safety net | DOM tests (Vitest + happy-dom + Testing Library + user-event). Screenshot scenarios for open dialogs, menus and tooltips, plus a dev gallery that gets screenshotted too. |
| 1 | Skeleton | `src/ui` + `@/ui`, files moved, imports codemodded, lint boundaries on. No behaviour change. |
| 2 | Foundations | `enabled:` variant, `bg-tint-*`, pulse animations as theme entries, PortalProvider. Generic hooks moved and fixed (`useEasedValue` with reduced motion, `useSetting` on a shared store). |
| 3 | Pressables | Base UI in. Button, IconButton and Link on one base. Every raw `<button>` gone. |
| 4 | Overlays | Tooltip, Dialog and Menu on Base UI. The three kebab menus become one `Menu`. |
| 5 | Controls | Toggle, SegmentedControl, TextField/Field, Disclosure. AddServiceDialog uses a real `<form>`. |
| 6 | Surfaces | Card variants (interactive, divided list, inset footer, padded `li`), Badge, IconTile, StatusDot, LoadingState, EmptyState, ErrorBanner, ListRow, PageHeader. No caller selectors left. |
| 7 | Data display | Readout, MetricValue, BarMeter, Sparkline, ProgressBar, SplitBar, Timeline, ThroughputChart. |
| 8 | Shell | Props-only TitleBar and NavRail. |
| 9 | Features | Views split, Apps/Hosts/Traffic deduplicated, logic moved to tested utils, fetches moved to hooks, bugs fixed. |
| 10 | Styles | Component styles out of `utilities.css`. Type utilities set type only, with colour as a separate class `cn` can merge. |
| 11 | Docs | docs/develop/frontend.md rewritten, lint scripts updated, `docs/figma-delta.md` handed over for the Figma pass. |

## 4. Decisions for you

1. **Headless library:** Base UI (recommended), Radix, or keep it hand-rolled.
2. **Button vocabulary:** `variant` × `tone` × `size` as above (recommended).
   The alternative keeps Figma's `filled`/`danger`/`secondary` and only adds
   `size`. Either way, Figma follows later through the delta file.
3. **Location:** move to `src/ui` and `@/ui` (recommended), or restructure in
   place under `src/components`.
