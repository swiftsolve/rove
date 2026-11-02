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
  `onClose`. The UI library in `src/ui` takes only props and never reads app
  context (see [The UI library](#the-ui-library)).

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
  `usePresence(isActive, exitMs)` from `@/ui`, styled as leaving
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

## Names and copy

- A boolean reads as a yes/no question: `isOpen`, `areEventsLoading`,
  `hasGradient`, `canRunTest`, `shouldShowLabel`, `wasDeclined`, or a verb
  phrase (`needsNetworkInfo`). That covers props, `useState` pairs
  (`[isOpen, setIsOpen]`), params, fields and module constants (`IS_MAC`).
  Names the DOM or a library picks keep theirs: alias Recharts' `active` to
  `isActive` where you read it.
- No `readonly`, `Readonly<>`, `ReadonlyArray`, `ReadonlyMap` or
  `ReadonlySet`; use the plain type.
- Inline items are separated by `DotSeparator` or `InlineMeta`, never a typed
  `·` or `•`. A string that would join parts with ` · ` returns the parts.
- In-app hints (help tooltips, `*_HINT` constants, empty and unsupported
  states) are two short sentences at most, about 20 words: what's measured and
  the one or two limits that matter. How it works belongs in the README.

`npm run lint` enforces all but the last.

## Tests

- Pure logic in `utils/` and `lib/` has unit tests beside it, named after its
  module plus `.test` (`chart-scale.test.ts`). They run in Node and never touch
  the DOM or the bridge, so keep logic worth testing out of components and
  hooks.
- Components have DOM tests beside them (`Button.test.tsx`), rendered into
  happy-dom with Testing Library. They test behaviour and accessibility: roles,
  names, keyboard, focus, disabled.
- Every story is a test too. It renders in headless Chromium with the real
  styles, runs its `play` function and fails on any accessibility violation
  (`@storybook/addon-vitest`). Storybook's testing widget runs them from the
  sidebar; `npx vitest --project=storybook` runs them alone. A new machine
  needs `npx playwright install chromium` once.
- All three kinds run with `npm test`, part of `npm run check`, which CI
  runs on every push and pull request (`.github/workflows/test.yml`).
- Looks are checked by pixels. `npm run screenshots -- --stable` uses a paused
  fake clock, seeded randomness and paused animations, so two runs of the same
  code match exactly. Diff a run against one from before a change to prove a
  refactor changed nothing on screen. With `--stable` it also shoots the open
  menus, dialogs, tooltips, a focus ring, and every component's All States
  story from Storybook (`25-library/`).

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
  `page`, `page-header`, `banner`, …) are `@utility` definitions in
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

  - A prop that picks a variant takes its type from the recipe:
    `tone: VariantOf<typeof badgeVariants, 'tone'>` (from `@/ui`), so each
    value is named once. A boolean axis stays `boolean`. A recipe keyed by a
    domain type (`CapabilityLevel`, `SpeedSeries`) keeps that type.
  - A recipe sets its resting look in `defaultVariants`. cva applies no branch
    for `undefined`, so a `false` branch without a default is skipped when the
    prop is left out. The component also writes the default into its
    destructured props (`tone = 'current'`, `isDisabled = false`): that's what
    the docs' Default column reads, and `npm run lint` fails without it. A
    default that depends on another prop takes an `@default` tag instead
    (Button's `size`). A prop's doc comment doesn't repeat its default.
  - Something that adds no classes is `null`: a recipe with no base is
    `cva(null, …)`, and a value with nothing of its own is `neutral: null`. A
    boolean axis leaves out a branch that adds nothing.

- `cn()` (from `@/ui`, in `ui/foundations/cn.ts`) joins classes and lets a later utility override an
  earlier one that sets the same thing; use it wherever a component merges a
  `className` from outside, which is how a view adjusts a child. `cx` only
  joins fixed classes. `cn` lists every theme name so tailwind-merge can group
  them; when you add one to `tailwind.css`, add it there too.
  `npm run lint` runs `scripts/check-cn-theme.mjs`, which fails until you do.
- A view adjusts a shared component through its variants (`density`,
  `align`, `shouldTruncate`, `CardBody`'s `layout`), never a selector into
  its DOM (`[&_.some-part]:pt-12`). A tweak more than one view needs becomes a
  variant.
- `className` on a library component is only for its place in a layout:
  margin, position, z-index, size, flex or grid item, its own text alignment,
  rounding to fit its container, showing or hiding it. Padding, inner layout,
  type, colour or surface is a missing variant, or a style for an element the
  view owns: a card that lays out its own content does it in a `<div>`
  inside the Card; InlineMeta and MetricValue take their type from the line
  they sit in. `npm run lint` runs `scripts/check-ui-classname.mjs`, which
  fails on a restyle. Icons (coloured by `className`) and the unstyled
  `CollapsibleTrigger` are exempt. The one exception is a `:has()` selector in a `.module.css` (below);
  InlineMeta keeps its `inline-meta` and `inline-meta-item` classes for it.
- Buttons are `Button`, `IconButton` and `Link`, never a hand-written
  `<button>`.
  - Button takes three axes:
    - `variant`: `solid` or `soft`
    - `tone`, on a solid only: `accent`, or `negative` to stop something
    - `size`: `sm` or `md`
  - Solid defaults to md, soft to sm.
  - Button takes an `icon` component and draws it at 13px.
    IconButton draws its icon at 16px (`iconSize={14}` for an icon that reads
    large).
  - `isLoading` swaps the icon for a spinner (`loadingLabel` can swap the
    words). `isDisabled` dims.
  - Both states swallow every activation, a form submit included, and keep the
    button focusable, so a tooltip can say why. They mark the element with
    `data-disabled` and `data-loading`.
  - An IconButton's `label` names it and is its tooltip. `tooltip` replaces the
    bubble's text when it should say more.
  - Everything pressable shares that behaviour through
    `ui/foundations/pressable.ts`, and styles a hover or press that only
    applies while usable with the `usable:` variant (`usable:hover:bg-hover`).
- Behaviour that's hard to get right comes from Base UI (`@base-ui/react`),
  styled with our tokens: focus traps, positioning, roving focus, dismissal,
  ARIA wiring. The library wraps it, so features never import Base UI directly.
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

## The UI library

`src/ui` is the component library: the Figma components in code. Features
import it from `@/ui` and nothing else under `src/ui`. The library imports only
itself (by relative path) and packages, never app code. `npm run lint` enforces
both, and a raw `<button>` outside the library is a lint error.

The library keeps its own version, apart from the design system's:
`UI_LIBRARY_VERSION` in `version.ts`, which Storybook's name shows ("Rove
Components v1.0.0"). Raise it when the library's API changes.

- Each component has its own kebab-case folder at the top of `src/ui`, with
  its tests (`button/` holds Button and IconButton). There are
  no tiers: a component that starts using another stays where it is.
- `index.ts`, the stories and the Figma file's component pages group them by
  purpose, in this order:
  - Actions: button, link and menu
  - Inputs: text-field, toggle and segmented-control
  - Overlays: dialog and tooltip
  - Status and feedback: badge, status-dot, spinner, loading-state,
    banner and empty-state
  - Data display: data-list, readout, metric-value, bar-meter, split-bar,
    list-row, icon-tile and timeline
  - Containers: card, collapsible and separator
  - App frame: title-bar, nav-rail and page-header

  Figma has one more page after them, Patterns: the cards, charts and
  content that features build from the library.
- `foundations/` (`cn`, and `pressable`, the behaviour everything pressable
  shares), `hooks/` (generic UI hooks), `context/` (where dialogs portal), and
  `icons/`.
- Each component has stories beside it (`Button.stories.tsx`), titled by the
  same groups (`Actions/Button`). A family sits in a folder named for its
  parent (`Containers/Card/CardHeader`), and the parent's page shows its
  parts' props as tabs (`subcomponents`). `npm run storybook` serves them at
  `localhost:6006`, with a Theme switch in the toolbar (Docs pages follow it)
  and an accessibility check on every story. Its Figma tab embeds the
  story's component from the design file: a story title's last part is its
  key in `figma.json`, so a new component's stories find it with nothing
  set. `npm run build:storybook` writes a static copy to
  `storybook-static/`. Stories import the library by relative path, like the
  library itself. A new component gets its stories in the same change.
  A part with props of its own (`CardBody`, `NavItem`) gets its own stories
  file beside its module (`card/CardBody.stories.tsx`), so its props have
  controls; Storybook's subcomponent tabs can't. The parent's page still
  lists every part as a tab, for the family's props at a glance. The
  component and its parts share a folder (`Containers/Card/CardBody`),
  ordered in `.storybook/preview.tsx`.
- An interactive component (Menu, Dialog, Toggle, SegmentedControl,
  TextField, Collapsible) has a story that drives it with a `play` function
  and asserts what happens: keyboard, focus, the callbacks. Name it for the
  interaction (`Keyboard`, `EscapeCloses`) and tag it `!autodocs`, since
  moving focus would scroll its Docs page. A play that leaves the story as it
  found it (`DisabledOff`) can stay on the Docs page.
- `components.json` is the library's API in one file, for agents and people:
  each component's group, doc comment, props (type, variant values, default),
  Figma component and story ids. `npm run catalogue` writes it from the code
  and `figma.json`, which names each component's Figma component and node
  (`null` when Figma has none). `npm run lint` fails when it's stale, or when a
  component has no doc comment, no `figma.json` entry or no row in the
  [Components](#components) table.

Every component follows the same rules:

- It takes `className` for its place in a layout.
- Styles are CVA recipes, with variant, tone and size as separate axes.
- State is exposed as data attributes.
- Composition happens through compound parts and slots, never `cloneElement`
  or reaching into a child's DOM.

A component that renders one element forwards its ref and passes extra props
through to it.

## Components

Each Figma component has a counterpart in the library; build from these before
writing new markup. Icons come from `@/ui` (`<HomeIcon />`, the brand mark is
`<BrandIcon />`); don't draw new ones inline.

| Figma | Code | Use |
| --- | --- | --- |
| Title bar, Title bar status, Window button | `TitleBar`, `TitleBarStatus`, `WindowButton` | Brand, connection status and window controls, on `--bg-chrome`. 56px tall (`--titlebar-height`). `AppTitleBar` fills it from the app. |
| Nav rail | `NavRail`, `NavItem` | One item per page, on `--bg-chrome`; the current page's is active, with an `--accent-muted` tint and an edge bar. `TabBar` fills it from the tab registry. |
| Page header | `PageHeader` | Top of every page except Home: icon chip, title, `description` and `actions`, over a full-width divider. `status` ("Checking…") takes the description's place while something runs. `onBack` (Back in Figma) puts a back button in the icon's place. |
| Button | `Button` | `variant` solid (the main action; `tone="negative"` to stop it), soft (everything else; `tone="negative"` on a red surface, like an error Banner's Dismiss). |
| Icon button | `IconButton` | Icon-only, with a tooltip (`label`, or `tooltip` for a hint), as a soft chip, or `variant="ghost"` with no fill until hovered (a dialog's close). |
| Link | `Link` | A muted link at its text's size. `onClick` opens another view and ends in a caret; `href` opens an address in a new window and ends in an arrow. |
| Menu, Menu trigger, Menu item | `Menu`, `MenuTrigger`, `MenuContent`, `MenuItem` | An overflow menu behind a kebab, on `bg-popover` with `shadow-popover`; `MenuItem tone="negative"` for a destructive action. |
| Dialog | `Dialog`, `DialogRoot` | Modal: title, optional description, a recessed body, an optional `footnote` under it, Cancel and the main action. Render the component that holds it inside `<DialogRoot isOpen>`, which mounts it on open and keeps it through the leave animation. |
| Tooltip | `Tooltip` | Short hint on hover and keyboard focus, on the trigger's `side`, centred on it, on `bg-popover` with `shadow-popover`. Screen readers get it as the trigger's description. |
| Toggle | `Toggle` | On/off switch for a setting. |
| Segmented control, Segment | `SegmentedControl` | A few exclusive options side by side (the theme picker): a radio group. |
| Text field | `TextField`, `TextFieldAction` | A labelled input with an announced `feedback` line and an optional action inside its border (Test). Put fields in a `<form>`. |
| — | `Collapsible`, `CollapsibleTrigger`, `CollapsiblePanel` | Shows and hides a panel (the connection card's details, an app's hosts). `hasFocusFrame` rings the whole collapsible, not the trigger, whose header takes its hover look on focus; the panel animates its height. |
| Card, Card header | `Card`, `CardHeader`, `CardBody`, `CardFooter` | A card with a 44px header (icon, title, `actions`), a body and an optional footer band. `CardBody layout`: `default` pads all round, `rows` for rows with their own vertical padding (no top padding, 12px above a footer), `flush` for a `DataListStack`. `onOpen` makes the whole card a link, named by its header's title (`linkLabel` when it should say more): it draws the link, its header ends in a caret, and it lifts on hover and presses in. A control inside raises itself above the link (`relative z-2`); header actions already do. `Card as="li" \| "div"` is a bare surface. It always clips to its corners, so anything that floats out of it portals. |
| Card list | `CardList` | A list that is one card: its `<li>` rows, with a hairline between them running edge to edge. `label` names it. |
| Data row | `DataRow`, `DataList`, `DataListStack` | Label and value, the value right-aligned. Rows go in a `DataList`, which makes them a `<dl>` and sets their `density`; `DataListStack` groups several, with a hairline between that runs end to end: place it flush to the card's sides (`CardBody layout="flush"`), and it insets each group. |
| List row | `ListRow` | A whole-row button that opens something, with a chevron on the right. Right-aligned content (a meter) is its last child. Disabled, the whole row fades. |
| — | `StretchedLink` | A transparent link over a whole row, so a click anywhere opens its view. A Card draws its own with `onOpen`. |
| Badge, Live badge | `Badge`, `LiveBadge` | A tinted uppercase flag (`tone`), or the dark Live pill with a pulsing dot. |
| Status dot | `StatusDot` | A 5px dot beside status words, in their colour or `tone="positive"`; `pulse` calm, live or busy. |
| Icon tile | `IconTile`, `IconTileButton` | The tinted square behind an item's icon (`icon`, `size`, `color`): any colour, usually a token (`var(--series-down)`), or `neutral`, the sunken fill for something uncategorised. The button form opens something. |
| Timeline node | `TimelineNode` | One event on a timeline, an `<li>`: a round marker (`icon`, `color`: any colour, usually a status token, or `neutral`, a hollow ring for something that left), its lines beside it, and a line down to the next node. The events feed and the services timeline use it. |
| Bar meter (in Signal bars, Capability cell) | `BarMeter` | Four rising bars, some lit, at four sizes (`value`, `size`, `color`): any colour, usually a status token (`var(--status-good)`), or the text colour around it. `CapabilityMeter` and the connection card's signal use it. |
| Split bar | `SplitBar` | A 3px track with a download and an upload segment, scaled against `max`. Rows in one list share `max` so their bars compare (a usage row). |
| Dot separator | `DotSeparator`, `InlineMeta` | A dot between inline items. Never type a middle dot. It takes its type from its line. `shouldTruncate` keeps them on one line, each ellipsizing; otherwise they wrap. |
| Metric value | `MetricValue` | A number in the numeric face that eases to each new value, coloured by `status` when it's earned. Its size comes from the text around it. |
| Readout | `Readout` | A number and its unit (live speed, data used), `size` large or compact (a summary card's figure, with no label), with an optional `label` and `icon`. Labelled, it goes in a `<dl>`; without a label, the icon sits inline with the figure. |
| Throughput chart | `ThroughputChart` (live-throughput) | Last 60 seconds of download (solid) and upload (dashed), scaled by `maxValue`. |
| Sparkline | `Sparkline` (services) | Recent latency for a service row. |
| Connection card, Traffic card, Capabilities card, Stat card | features | Built from the above, on the Patterns page. |
| Banner | `Banner` | A message above a page: title, a line under it, then Dismiss and Retry. `variant="error"` for a failure: Dismiss is red to match, Retry neutral. |
| Empty state | `EmptyState`, `EmptyStateDescription` | Blank page: faded placeholder rows (a lock badge when `isLocked`), title, `description` and `actions`. `EmptyStateDescription` is a further line an action adds (`role="status"` to announce it). |
| Loading state | `LoadingState` | A page's first load: the spinner over a line, announced. |
| Spinner, Button spinner | `Spinner`, `ButtonSpinner` | Loading indicators. Buttons show the button spinner for `isLoading`; use it directly only outside a button. |
