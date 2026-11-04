# Rove frontend

How the React UI in `src/` is organised and styled, and which component to use
for what. Read it before writing or changing UI. For where files live, see
[Layout](../../README.md#layout) in the README.

- [Checklists](#checklists) for the common changes
- Rules: [State](#state-context-not-prop-drilling),
  [Where code goes](#where-code-goes), [Names and copy](#names-and-copy),
  [Styles](#styles-tailwind-utilities-from-the-design-tokens),
  [Tests](#tests), and [what lint enforces](#whats-enforced)
- The library: [The UI library](#the-ui-library) and its
  [Components](#components)

## Checklists

Each list ends in the checks for it; [AGENTS.md](../../AGENTS.md) has the steps
after a commit (syncing the sites and Storybook).

### Add a library component

1. A kebab-case folder at the top of `src/ui` holding `Name.tsx`. A component
   that renders one element takes `ComponentProps<'div'>` (its element's).
   Styles are a CVA recipe; its defaults go in `defaultVariants` and in the
   destructured props.
2. A doc comment on the component and on each prop of its own.
3. An export from `src/ui/index.ts`, under its group's comment.
4. Stories beside it (`Name.stories.tsx`), titled by its group
   (`Data display/Name`), with an `AllStates` story when it has several states.
   An interactive one gets a `play` story too.
5. A DOM test beside it (`Name.test.tsx`) for its behaviour and accessibility.
6. Its entry in `src/ui/figma.json` (`null` when Figma has none) and its row in
   the [Components](#components) table. The entry's `name` and `node` are the
   Figma component's (or component set's) name and the id in its link's
   `node-id`, with `-` as `:`; never guess one. Map the component set, not
   one of its variants. A prop with values Figma has no variant for goes in
   the entry's `codeOnly`, a Figma variant code derives from other props in
   `figmaOnly`, each with why. With `FIGMA_TOKEN` in `.env.local` (or in CI),
   `npm run check` holds the names, variants and values to the file.
7. `npm run catalogue`. Raise `UI_LIBRARY_VERSION` in `src/ui/version.ts`
   when the library's API changes, this included.
8. The Figma side: the component on its group's page in the Figma file, with
   the same props and variants.

Check: `npm run check`, then `npm run storybook` to look at it in both themes.

### Change a library component

1. Change the code, its doc comments and stories, and the
   [Components](#components) row if its use changed.
2. `npm run catalogue`, and raise `UI_LIBRARY_VERSION` for an API change.
3. The same change in Figma.

Check: `npm run check`. For a change meant to look the same, diff
`npm run screenshots -- --stable` from before and after.

### Add a screen or tab

1. The view in its feature's folder, rendering with no props (it reads context
   and its data hooks). Every page but Home starts with a `PageHeader`.
2. A new tab is its id in `APP_TABS` (`app/utils/tabs.ts`) plus its entry in
   `TABS` (`app/utils/tab-registry.ts`): label, icon, `Screen`. A subpage is the
   tab's `subScreen`. Focus and scroll on navigating need no code.
3. Copy follows [Names and copy](#names-and-copy); an empty, loading and failed
   state each use the library's (`EmptyState`, `LoadingState`, `Banner`).

Check: `npm run check`, `npm run dev` in both themes, and `npm run a11y`.

### Show new backend data

The six steps are in
[Learning Rust and Tauri](learning/rust-and-tauri/05-in-practice.md#12-build--run-it-add-a-command-end-to-end):
the logic in `rove-core`, a command in `src-tauri`, the type in `src/types`,
both bridges (Tauri and the dev mock), then a hook. The hook goes in the
feature's `hooks/`, on `useBackendQuery`, keyed by the data plus
`useNetworkKey()` when it belongs to one network.

Check: `cargo test -p rove-core`, `npm run check`, and `npm run dev` against
the mock.

## State: context, not prop drilling

- No component takes a prop only to pass it down. App-wide state comes from
  context, read where it's used: `useNavigation()` (location, `navigate`,
  `back`), `useTheme()`, `useNetwork()` (network info), `useInternetStatus()`
  and `useConnectionStatus()` (the title bar's verdict). Each has its own small
  context, so a reader re-renders only when its value changes. That's why every
  view renders with no props.
- A screen change moves focus to the new page's h1. Going back (the Back
  button or history) lands on the control that opened the next screen instead,
  scrolled to where it was, ringed only if it was reached by keyboard:
  `navigate` saves it on the history entry it leaves. So a row, card or link
  that opens a screen just calls `navigate`, with no focus code of its own.
- Backend data comes from TanStack Query. Each feature owns its data hook in
  `hooks/` (`useDevices`, `useDataUsage`, …), built on `useQuery` through
  `useBackendQuery`, and the components that show the data call it directly.
  Callers of the same hook share one cache entry, so `DevicesView` and
  `DevicesCard` see the same scan. Network info and internet status are
  app-wide rather than per screen: `NetworkProvider` reads them with `useQuery`
  directly and components get them from `useNetwork()` and
  `useInternetStatus()`. Live throughput and the speed test are event streams,
  not reads, so each keeps a module store read with `useSyncExternalStore`.
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
  the hook.
- Each tab's label, rail icon and placement, screen and subpages are one entry
  in `TABS` (`app/utils/tab-registry.ts`); `TabBar` and `CurrentScreen` read
  it. A new tab is its id in `app/utils/tabs.ts` plus that entry.
- A custom hook lives in its own file in a `hooks/` folder, never inside a
  component file.
- React 19 idioms: a component's return type is inferred (annotate it only as
  `JSX.Element | null`, when it can render nothing); a context is read with
  `use(SomeContext)` and provided as `<SomeContext value={…}>`; an effect reads
  fresh props through `useEffectEvent`.
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
  `ConnectionStrip.tsx` and `ConnectionStrip.module.css`.
- File names say what a file is. A component is PascalCase (`ThemeProvider.tsx`),
  a hook is camelCase starting with `use` (`useTheme.ts`), and everything else
  is kebab-case: contexts, utils and types (`theme-context.ts`), global
  stylesheets (`base.css`) and folders (`live-throughput/`).
- Prettier lays out the code (`.prettierrc.json`: no semicolons, single
  quotes, 120 columns); `npm run format` applies it. Markdown and generated
  files are left alone (`.prettierignore`).
- Imports come in three groups, each sorted: packages, then the app's own
  modules (`@/…`), then relative paths. `npm run lint -- --fix` sorts them.
  JSX is linted for accessibility (jsx-a11y's strict set); a deliberate
  exception is a line-level disable that says why.
- A comment says why: a reason, constraint or trap the code can't show. One
  that restates the code goes. Exports, props and type fields take `/** */`,
  on one line when it fits, else opening on a line of its own; implementation
  notes take `//`. Keep it short: a `//` note in at most 6 lines, a `/** */`
  doc in at most 10, and anything longer in `docs/`. No em dash, no divider
  comments, and a lint exception says why after `--`.

## Names and copy

- A boolean reads as a yes/no question: `isOpen`, `areEventsLoading`,
  `hasGradient`, `canRunTest`, `shouldShowLabel`, `wasDeclined`, or a verb
  phrase (`needsNetworkInfo`). That covers props, `useState` pairs
  (`[isOpen, setIsOpen]`), params, fields and module constants (`IS_MAC`).
  Names the DOM or a library picks keep theirs: alias Recharts' `active` to
  `isActive` where you read it.
- Data that's shared and must not change (a context value, a list passed
  down as a prop, a module-level table) can be typed `readonly T[]`,
  `ReadonlyMap` or `Readonly<…>`, so the compiler catches a stray mutation.
- An object shape is a `type`, never an `interface`, so a shape that grows
  into a union or an intersection keeps its keyword. A prop it redeclares from
  a base is omitted from the base
  (`Omit<HTMLAttributes<HTMLElement>, 'children'> & {…}`), or the docs drop it.
- Inline items are separated by `DotSeparator` or `InlineMeta`, never a typed
  `·` or `•`. A string that would join parts with ` · ` returns the parts.
- A missing value is `NoValue`, never a typed `—`. A formatter returns null
  for one, and the caller renders the bar.
- Copy never punctuates with an em dash: write two short sentences or
  rephrase.
- In-app hints (help tooltips, `*_HINT` constants, empty and unsupported
  states) are two short sentences at most, about 20 words: what's measured and
  the one or two limits that matter. How it works belongs in the README.

## Styles: Tailwind utilities from the design tokens

Tokens are designed in the [Rove Design System](https://www.figma.com/design/NoICIoyhWNOya9tOnNfEhH/Rove-Design-System)
in Figma, released from rove-tokens, and reach the UI through
`@swiftsolve/rove-tokens`; the two stay in step through its plugin's Sync and
`npm run figma -- check`. Components start here in `src/ui`, and their Figma
components mirror them. Which token to use for what, with every
value, is in its `DESIGN.md`
(`node_modules/@swiftsolve/rove-tokens/DESIGN.md`); the published slideshow
shows it without Figma: <https://swiftsolve.github.io/rove-tokens/>.

- Components are styled with Tailwind v4 utilities in the TSX. The theme in
  `src/styles/tailwind.css` is built only from the tokens, so `p-12` is
  `--spacing-12`, `text-md` is `--font-size-md` and `bg-surface` is `--bg-surface`;
  there are no Tailwind defaults to reach for. There's no preflight:
  `styles/base.css` is the reset.
- Colours and easings are always tokens, and so is any length, weight or
  duration a token has: `p-12`, not `p-[12px]`. Every gap, padding and margin
  is a spacing step, or a `calc()` of tokens. A value that has to stay (the
  QR code's white plate, a gap set by an icon's ink) goes in
  `scripts/checks/raw-values.mjs`'s `ALLOWED` list, with why.
- Text takes a Figma text style's class from rove-tokens' `text-styles.css`
  (`type-caption`, `type-overline`, `type-number-default`, …) and a colour
  utility: `type-caption text-tertiary`. The classes set no colour and sit
  under every utility, so `text-sm` or `leading-[1.15]` beside one wins.
- Shared layout and faces (`num`, `metric-value`, `surface`, `page`,
  `page-header`, `banner`, …) are `@utility` definitions in
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
    the docs' Default column reads. A default that depends on another prop
    takes an `@default` tag instead (Button's `size`). A prop's doc comment
    doesn't repeat its default.
  - Something that adds no classes is `null`: a recipe with no base is
    `cva(null, …)`, and a value with nothing of its own is `neutral: null`. A
    boolean axis leaves out a branch that adds nothing.

- `cn()` (from `@/ui`, in `ui/utils/cn.ts`) joins classes and lets a
  later utility override an earlier one that sets the same thing; use it
  wherever a component merges a `className` from outside, which is how a view
  adjusts a child. `cx` only joins fixed classes. `cn` lists every theme name
  and `type-*` class so tailwind-merge can group them; when you add one to
  `tailwind.css` or rove-tokens adds a text style, add it there too (lint
  checks).
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
  they sit in. Icons (coloured by `className`) and the unstyled
  `CollapsibleTrigger` are exempt. The one exception is a `:has()` selector in
  a `.module.css` (below); InlineMeta keeps its `inline-meta` and
  `inline-meta-item` classes for it.
- Animations are theme entries in `tailwind.css` (`animate-menu-in`), with
  their keyframes. A `.module.css` file is only for what utilities can't say:
  selectors into another component's DOM keyed on `:has()`.

## Tests

- Pure logic in a `utils/` folder has unit tests beside it, named after its
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
- `npm run a11y` runs axe on every screen, subpage and dialog in both themes,
  and fails on any violation.

## What's enforced

`npm run check` fails on these, so a rule here needs no review. Each check in
`scripts/checks/` says what it guards.

| Rule | Enforced by |
| --- | --- |
| Library and context import boundaries, no raw `<button>` | ESLint, `no-restricted-imports` and `no-restricted-syntax` |
| No typed `·`, typed `—` or em dash in copy | ESLint, `no-restricted-syntax` |
| Boolean prefixes, `type` over `interface`, import order, jsx-a11y | ESLint |
| Comments: length, one-line `/** */`, no em dash, a reason on every lint exception | ESLint, `scripts/eslint/comments.mjs` and eslint-comments |
| Layout | Prettier |
| File names | `checks/file-names.mjs` |
| Tokens, not raw values; gaps, paddings and margins on the spacing scale | `checks/raw-values.mjs` |
| Every theme name listed in `cn` | `checks/cn-theme.mjs` |
| `className` only places a library component | `checks/ui-classname.mjs` |
| CSS Module classes match their use | `checks/css-modules.mjs` |
| `components.gen.json` fresh; doc comments, defaults, `figma.json` and Components rows present | `build-ui-catalogue.mjs --check` |
| Figma and the library agree: `figma.json`'s nodes and names, every variant property and its values, and every usage guide's sections, line counts and named alternatives (skipped without `FIGMA_TOKEN`) | `checks/figma.mjs` |
| Behaviour, and accessibility per story | `npm test` |

`checks/escapes.mjs` never fails: it counts the ways around these rules (lint
disables, allowed raw values, Figma exceptions) in every run and in CI's job
summary, so a rise shows. `--list` names each one.

Review still has to catch: props passed only to pass down, hints over two
sentences, focus or presence handled by hand, a view reaching into a
component's DOM, and Figma out of sync beyond its variants and guides (a
token, a spacing, a guide line's wording).

## The UI library

`src/ui` is the component library: the Figma components in code. Features
import it from `@/ui` and nothing else under `src/ui`. The library imports only
itself (by relative path) and packages, never app code.

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
  - Accessibility: screen-reader

  Figma has one more page after them, Patterns: the cards, charts and
  content that features build from the library.
- `utils/` (`cn`; `pressable`, the behaviour everything pressable
  shares; `layers`, the one stacking order, so an overlay picks a named layer
  rather than a z-index; and `tint`, the "any colour or neutral" wash IconTile
  and TimelineNode share), `hooks/` (generic UI hooks), `context/` (where
  dialogs portal), and `icons/`.
- Each component has stories beside it (`Button.stories.tsx`), titled by the
  same groups (`Actions/Button`). A family sits in a folder named for its
  parent (`Containers/Card/CardHeader`), and the parent's page shows its
  parts' props as tabs (`subcomponents`). `npm run storybook` serves them at
  `localhost:6006`, with a Theme switch in the toolbar (Docs pages follow it)
  and an accessibility check on every story. Its Figma tab embeds the
  story's component from the design file: a story title's last part is its
  key in `figma.json`, so a new component's stories find it with nothing
  set. `npm run build:storybook` writes a static copy to
  `storybook-static/`. Master's is hosted at
  <https://rove.swiftsolve.net/storybook/> (synced by hand; see `AGENTS.md`),
  and every push publishes to Chromatic for visual tests. Stories import the
  library by relative path, like the library itself. A new component gets its
  stories in the same change.
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
- A component's usage guide sits on its Docs page: the stories' `guidance`
  parameter (`Guidance` in `.storybook/docs-page.tsx`), with When to use, When
  not to use, and Accessibility split into Built in and You handle, a few words
  a line. What the stories and props table already show (each state, each
  variant) stays out. Set `docs: { toc: GUIDANCE_TOC }` beside it for the page's
  contents. Every component has one, written for its whole family (Card's
  covers CardHeader and the rest), and Figma's docs section carries the same
  guide as a Guidance block under its intro.
- `components.gen.json` is the library's API in one file, for agents and people:
  each component's group, doc comment, props (type, variant values, default),
  Figma component, story ids and usage guide. `npm run catalogue` writes it from the code
  and `figma.json`, which names each component's Figma component and node
  (`null` when Figma has none).

Every component follows the same rules:

- It takes `className` for its place in a layout.
- A component that renders one element passes `ref` and that element's other
  props through, so any can be a Tooltip's trigger or take an `aria-*`.
- A status line is announced from a region that's always mounted, changing
  only its text: a region that mounts already holding its text often isn't
  read. TextField's feedback and PageHeader's `status` work this way.
- Styles are CVA recipes, with variant, tone and size as separate axes.
- State is exposed as data attributes.
- Composition happens through compound parts and slots, never `cloneElement`
  or reaching into a child's DOM. The one exception is Tooltip, which joins
  its own description to one its trigger already has: Base UI lets the
  trigger's props win, so there's no other way to set both.
- Behaviour that's hard to get right comes from Base UI (`@base-ui/react`),
  styled with our tokens: focus traps, positioning, roving focus, dismissal,
  ARIA wiring. The library wraps it, so features never import Base UI directly.
- Props share names across components and with Figma: `variant`, `isLoading`,
  `isDisabled`, `isChecked`; the text under a title is `description` and the
  controls a component holds are `actions`; a colour by role is `status` or
  `tone` (`positive`, `warning`, `negative`, `neutral`); a quality rating is
  `level` (`excellent`, `good`, `fair`, `poor`).

A component that renders one element takes its props as `ComponentProps<'button'>`
(or its element's), so `ref` and extra props pass through to it. No `forwardRef`:
in React 19 `ref` is a prop.

### Buttons

Buttons are `Button`, `IconButton` and `Link`, never a hand-written
`<button>`.

- Each one's Docs page in Storybook says when to use it and each variant, its
  states and its accessibility; its props table lists the defaults.
- Disabled and loading swallow every activation, a form submit included, and keep the
  button focusable, so a tooltip can say why. They mark the element with
  `data-disabled` and `data-loading`.
- Everything pressable shares that behaviour through
  `ui/utils/pressable.ts`, and styles a hover or press that only
  applies while usable with the `usable:` variant (`usable:hover:bg-hover`).

## Components

Each Figma component has a counterpart in the library; build from these before
writing new markup. Icons come from `@/ui` (`<HomeIcon />`, the brand mark is
`<BrandIcon />`); don't draw new ones inline.

| Figma | Code | Use |
| --- | --- | --- |
| Title bar, Title bar status, Window button | `TitleBar`, `TitleBarStatus`, `WindowButton` | Brand, connection status and window controls, on `--bg-chrome`. 56px tall (`--titlebar-height`). `AppTitleBar` fills it from the app. |
| Nav rail | `NavRail`, `NavItem` | One item per page, on `--bg-chrome`; the current page's is active, with an `--accent-muted` tint and an edge bar. On a page change the bar slides to the new item while the tints cross-fade. `TabBar` fills it from the tab registry. |
| Page header | `PageHeader` | Top of every page except Home: icon chip, title, `description` and `actions`, over a full-width divider. `status` ("Checking…") takes the description's place while something runs. `onBack` (Back in Figma) puts a back button in the icon's place. |
| Button | `Button` | `variant` solid (the main action; `tone="negative"` to stop it), soft (everything else; `tone="negative"` on a red surface, like an error Banner's Dismiss). |
| Icon button | `IconButton` | Icon-only, with a tooltip (`label`, or `tooltip` for a hint), as a soft chip, or `variant="ghost"` with no fill until hovered (a dialog's close). |
| Link | `Link` | A muted link at its text's size. `onClick` opens another view and ends in a caret; `href` opens an address in a new window and ends in an arrow. |
| Menu, Menu trigger, Menu item | `Menu`, `MenuTrigger`, `MenuContent`, `MenuItem` | An overflow menu behind a kebab, on `bg-popover` with `shadow-popover`; `MenuItem tone="negative"` for a destructive action. |
| Dialog | `Dialog`, `DialogRoot` | Modal: title, optional description, a recessed body, an optional `footnote` under it, Cancel and the main action. Render the component that holds it inside `<DialogRoot isOpen>`, which mounts it on open and keeps it through the leave animation. Its height springs to fit when its content changes (`ease-spring` over `--duration-spring`); fade a swapped-in state with `animate-fade-in`. |
| Tooltip | `Tooltip` | Short hint on hover and keyboard focus, on the trigger's `side`, centred on it, on `bg-popover` with `shadow-popover`. Screen readers get it as the trigger's description. |
| Toggle | `Toggle` | On/off switch for a setting. Disabled, it stays in the Tab order, like a disabled Button. |
| Segmented control, Segment | `SegmentedControl` | A few exclusive options side by side (the theme picker): a radio group, named by `label` or `aria-labelledby`. |
| Text field | `TextField`, `TextFieldAction` | A labelled input with an announced `feedback` line and an optional action inside its border (Test). Put fields in a `<form>`. |
| None | `Collapsible`, `CollapsibleTrigger`, `CollapsiblePanel` | Shows and hides a panel (the connection card's details, an app's hosts). `hasFocusFrame` rings the whole collapsible, not the trigger, whose header takes its hover look on focus; the panel animates its height. |
| Card, Card header | `Card`, `CardHeader`, `CardBody`, `CardFooter` | A card with a 44px header (icon, title, `actions`), a body and an optional footer band. `CardBody layout`: `default` pads all round, `rows` for rows with their own vertical padding (no top padding, 12px above a footer), `flush` for a `DataListStack`. `onOpen` makes the whole card a link, named by its header's title (`linkLabel` when it should say more): it draws the link, its header ends in a caret, and it lifts on hover and presses in. A control inside raises itself above the link (`relative z-2`); header actions already do. `Card as="li" \| "div"` is a bare surface. It always clips to its corners, so anything that floats out of it portals. |
| Card list | `CardList` | A list that is one card: its `<li>` rows, with a hairline between them running edge to edge. `label` names it. |
| Data row | `DataRow`, `DataList`, `DataListStack` | Label and value, the value right-aligned. Rows go in a `DataList`, which makes them a `<dl>` and sets their `density`; `DataListStack` groups several, with a hairline between that runs end to end: place it flush to the card's sides (`CardBody layout="flush"`), and it insets each group. |
| List row | `ListRow` | A whole-row button that opens something, with a chevron on the right. Right-aligned content (a meter) is its last child. Disabled, the whole row fades. |
| None | `StretchedLink` | A transparent link over a whole row, so a click anywhere opens its view. A Card draws its own with `onOpen`. |
| None | `ScreenReaderStatus` | A live region only screen readers hear: hidden, kept mounted, it reads out its text as it changes ("Testing download…"). Pass empty text when there's nothing to say. Other hidden words stay a plain `sr-only` span. |
| Badge, Live badge | `Badge`, `LiveBadge` | A tinted uppercase flag (`tone`), or the dark Live pill with a pulsing dot. |
| Status dot | `StatusDot` | A 5px dot beside status words, in their colour or `tone="positive"`; `pulse` calm, live or busy. |
| Icon tile | `IconTile`, `IconTileButton` | The tinted square behind an item's icon (`icon`, `size`, `color`): any colour, usually a token (`var(--series-down)`), or `neutral`, the sunken fill for something uncategorised. The button form opens something. |
| Timeline node | `TimelineNode` | One event on a timeline, an `<li>`: a round marker (`icon`, `color`: any colour, usually a status token, or `neutral`, a hollow ring for something that left), its lines beside it, and a line down to the next node. The events feed and the services timeline use it. |
| Bar meter (in Signal bars, Capability cell) | `BarMeter` | Four rising bars, some lit, at four sizes (`value`, `size`, `color`): any colour, usually a status token (`var(--status-good)`), or the text colour around it. `CapabilityMeter` and the connection card's signal use it. |
| Split bar | `SplitBar` | A 3px track with a download and an upload segment, scaled against `max`. Rows in one list share `max` so their bars compare (a usage row). |
| Dot separator | `DotSeparator`, `InlineMeta` | A dot between inline items. Never type a middle dot. It takes its type from its line. `shouldTruncate` keeps them on one line, each ellipsizing; otherwise they wrap. |
| Metric value | `MetricValue` | A number in the numeric face that eases to each new value, coloured by `status` when it's earned. Its size comes from the text around it. A `format` that returns null draws `NoValue`. |
| No value | `NoValue` | A short drawn bar where a value is missing, never a typed dash. It scales with its line, and screen readers hear `label` ("Not measured"; default "None"). Formatters return null for a missing value; the caller renders `NoValue`. |
| Readout | `Readout` | A number and its unit (live speed, data used), `size` large or compact (a summary card's figure, with no label), with an optional `label` and `icon`. Labelled, it goes in a `<dl>`; without a label, the icon sits inline with the figure. |
| Throughput chart | `ThroughputChart` (live-throughput) | Last 60 seconds of download (solid) and upload (dashed), scaled by `maxValue`. |
| Sparkline | `Sparkline` (services) | Recent latency for a service row. |
| Connection card, Traffic card, Capabilities card, Stat card | features | Built from the above, on the Patterns page. |
| Banner | `Banner` | A message above a page: title, a line under it, then Dismiss and Retry. `variant="error"` for a failure: Dismiss is red to match, Retry neutral. |
| Empty state | `EmptyState`, `EmptyStateDescription` | Blank page: faded placeholder rows (a lock badge when `isLocked`), title, `description` and `actions`. `EmptyStateDescription` is a further line an action adds (`role="status"` to announce it). |
| Loading state | `LoadingState` | A page's first load: the spinner over a line, announced. |
| Spinner, Button spinner | `Spinner`, `ButtonSpinner` | Loading indicators. Buttons show the button spinner for `isLoading`; use it directly only outside a button. |
