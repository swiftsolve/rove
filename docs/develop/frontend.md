# Rove frontend

How the React UI in `src/` is organised and styled, and which component to use
for what. Read it before writing or changing UI; `src/AGENTS.md` imports it, so
Claude Code loads it with the first file under `src/`. For where files live, see
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
   One that takes a handler gets a `play` story too.
5. A DOM test beside it (`Name.test.tsx`) for its behaviour and accessibility.
6. Its entry in `src/ui/figma.json` (`null` when Figma has none). The entry's `name` and `node` are the
   Figma component's (or component set's) name and the id in its link's
   `node-id`, with `-` as `:`; never guess one. Map the component set, not
   one of its variants. A prop with values Figma has no variant for goes in
   the entry's `noFigmaVariant`, a Figma variant code derives from other props in
   `noCodeProp`, each with why. With `FIGMA_TOKEN` in `.env.local` (or in CI),
   `npm run check` holds the names, variants and values to the file.
7. `npm run catalogue`. Raise `UI_LIBRARY_VERSION` in `src/ui/version.ts`
   when the library's API changes, this included.
8. The Figma side: the component on its group's page in the Figma file, with
   the same props and variants.

Check: `npm run check`, then `npm run storybook` to look at it in both themes.

### Change a library component

1. Change the code, its doc comments, and its stories and usage guide if its
   use changed.
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
`@swiftsolve/rove-tokens`, one way: a token changes in Figma and is exported
into rove-tokens, and `npm run figma:check` confirms the two agree. Components start here in `src/ui`, and their Figma
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
  is a spacing step, or a `calc()` of tokens, and every corner a radius token
  (a thin bar takes `rounded-full`, which rounds to half its width). A value
  that has to stay (the QR code's white plate, a gap set by an icon's ink, the
  About tile's app-icon corner) goes in `scripts/checks/raw-values.mjs`'s
  `ALLOWED` list, with why. DESIGN.md's Spacing and shape says which reasons
  count.
- Text takes a Figma text style's class from rove-tokens' `text-styles.css`
  (`type-caption`, `type-overline`, `type-number-default`, …) and a colour
  utility: `type-caption text-tertiary`. The classes set no colour and sit
  under every utility, so `font-medium`, `leading-[1.2]` or the `num` face
  beside one wins. The size always comes from the style: no `text-sm` alone,
  and no style with its size overridden. Text with no matching style (13px at
  500 is Body/Default plus `font-medium`) takes the nearest style at its size
  and a utility for the rest. A style sets its own line height, so text
  that should keep its line's (a timeline row's `*:leading-[1.3]`, a
  button's) adds `leading-[inherit]`. A stylesheet sets all four of a style's
  `--type-<style>-*` variables. Text no style fits at all goes in
  `scripts/checks/text-styles.mjs`'s `ALLOWED` list, with why.
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
- While working on a component, run just its folder, in seconds:
  `npx vitest run --project=storybook --project=dom src/ui/<folder>` runs its
  stories and DOM tests. Then look at it in Storybook in both themes: no test
  sees a wrong shade or a cramped gap.
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
| Tokens, not raw values; gaps, paddings and margins on the spacing scale, corners on the radius scale | `checks/raw-values.mjs` |
| Every custom property read (`var(--…)`, `p-(--…)`) is defined: no misspelt token | `checks/custom-properties.mjs` |
| Text takes a text style (`type-*`, or a style's `--type-*` variables), never a font size alone | `checks/text-styles.mjs` |
| Every text, status and accent token clears WCAG AA on the backgrounds DESIGN.md puts it on, in both themes | rove-tokens' `checks/contrast.mjs`, before a release |
| Every theme name listed in `cn` | `checks/cn-theme.mjs` |
| `className` only places a library component | `checks/ui-classname.mjs` |
| `components.gen.json` fresh; doc comments, defaults and `figma.json` entries present | `build-ui-catalogue.mjs --check` |
| A component with a handler prop has a story that drives it (`play`, tagged `!autodocs`) | `build-ui-catalogue.mjs --check` |
| An API change since the last commit raises `UI_LIBRARY_VERSION` | `build-ui-catalogue.mjs --check` |
| Figma and the library agree: `figma.json`'s nodes and names, every variant property and its values, and every usage guide's sections, line counts and named alternatives (skipped without `FIGMA_TOKEN`) | `checks/figma.mjs` |
| Behaviour, and accessibility per story | `npm test` |

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
Components v1.0.0"). Raise it when the library's API changes: major for a
removed or renamed component or prop, or a narrower type; minor for anything
added. The catalogue check fails an API change on an unchanged version;
picking major or minor is yours.

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
- A component that takes a handler (`onClick`, `onChange`, `onBack`) has a
  story that drives it with a `play` function and asserts what its guide
  promises: keyboard, focus, the callbacks, a disabled one ignoring a press.
  Name it for the interaction (`Pressing`, `EscapeCloses`) and tag it
  `!autodocs`, since moving focus would scroll its Docs page. The catalogue
  check fails a handler with no such story. A play that leaves the story as it
  found it (`DisabledOff`) can stay on the Docs page.
- A component's intro is one sentence on what it is, with no rules: the
  stories' `docs.subtitle` ("A headline number and its unit, with an optional
  label and icon."), shown under its name above the doc comment, and the same
  sentence under its name in Figma's docs section.
- A component's usage guide sits on its Docs page: the stories' `guidance`
  parameter (`Guidance` in `.storybook/docs-page.tsx`), with When to use,
  When not to use, and Accessibility split into Built in and To handle, a few
  words a line. Each line finishes its heading: under When to use, a situation,
  then how if it needs saying, then an example ("The page’s main action, solid:
  “Run test”."); under When not to use, a situation, then what to use instead
  ("Opening another view or an address: use `Link`."). A rule that isn't a
  situation goes in the doc comment instead. What the stories and props table
  already show (each state, each variant) stays out. Set
  `docs: { toc: GUIDANCE_TOC }` beside it for the page's contents. Every
  component has one, written for its whole family (Card's covers CardHeader and
  the rest), and Figma's docs section carries it as a Guidance block under its
  intro: When to use and When not to use line for line, worded for designers.
  Accessibility differs by reader. Storybook's is for developers: Built in
  names the element, roles and keyboard, To handle the props and markup to
  supply. Figma's is for designers: Built in is what they needn't draw or note,
  To handle what they decide or note on the design (label wording, grouping,
  what's read out). Figma's block also has Guidelines, between When not to use
  and Accessibility: how to use it well (variants, placement, content) as Do
  and Don't columns, each Don't the mistake its Do prevents. It's for
  designers only, as the props table and doc comment cover it in code, and
  only where there's advice to give: a fact about the component goes in Built
  in.
- `components.gen.json` is the library's API in one file, for agents and people:
  each component's group, doc comment, props (type, variant values, default),
  Figma component, story ids and usage guide. Read it, not the sources, to
  learn the API or pick a component. `npm run catalogue` writes it from the code
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

Each Figma component has a counterpart in the library: build from these before
writing new markup. Which one to use, and its props, variants and usage guide,
are in `src/ui/components.gen.json` (read it first) and on each component's
Docs page in Storybook (`npm run storybook`, or the
[hosted copy](https://rove.swiftsolve.net/storybook/)).

- Icons come from `@/ui` (`<HomeIcon />`; the brand mark is `<BrandIcon />`).
  Don't draw new ones inline.
- The app fills the frame's parts: `AppTitleBar` the title bar, and `TabBar`
  the nav rail, from the tab registry.
- Figma's Patterns page holds what features build from the library, like
  `ThroughputChart` (`features/live-throughput`) and `Sparkline`
  (`features/services`). They live with their feature, not in `src/ui`.
