# Rove frontend

How the React UI in `src/` is organised, styled and tested. `src/AGENTS.md`
imports it with rove-tokens' DESIGN.md, so Claude Code loads both the first
time it reads a file under `src/`; the library's own guide,
[src/ui/README.md](ui/README.md), joins them on a read under `src/ui/`. The procedures
(add a screen, show backend data, add a component) are skills, listed in
[AGENTS.md](../AGENTS.md).

**[✓ CHECKED by `file`]** marks a rule a check enforces: break it and
`npm run check` fails. The file it names is the check: `checks/` and `gen/` are
in `scripts/`, and [What's enforced](#whats-enforced) lists them all. A rule
without the tag is judgment.

## Rules

### Components

Each Figma component has a counterpart in the library: build from these before
writing new markup. Which one to use, and its props, variants and usage guide,
are in `src/ui/components.gen.json`: read it first, not the sources. Each
component's Docs page in Storybook shows the same, with its stories
(`src/ui/README.md`: Storybook).

- Icons come from `@/ui` (`<HomeIcon />`; the brand mark is `<BrandIcon />`).
  A new one joins the library, in `src/ui/icons/`.
- The app fills the frame's parts: `AppTitleBar` the title bar, and `TabBar`
  the nav rail, from the tab registry.
- Figma's Compositions page holds what features build from the library, like
  `ThroughputChart` (`features/live-throughput`) and `Sparkline`
  (`features/services`). They live with their feature, not in `src/ui`.

### State: context, not prop drilling

- Props are a component's own inputs: the item a row shows, a dialog's
  `onClose`. App-wide state comes from context, read where it's used: `useNavigation()` (location, `navigate`,
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
- The UI library in `src/ui` takes only props, so it reads no app context
  ([the library guide](ui/README.md)).

### Where code goes

- `app/` and every feature use the same subfolders: `components/`,
  `context/` (providers and their context objects), `hooks/` and `utils/`.
  Only a context's provider and hook import its object; everything else calls
  the hook. [✓ CHECKED by `eslint.config.js`]
- `TABS` (`app/utils/tab-registry.ts`) holds each tab's label, rail icon and
  placement, screen and subpages; `TabBar` and `CurrentScreen` read it.
- A custom hook lives in its own file in a `hooks/` folder.
- React 19 idioms: a component's return type is inferred (annotate it only as
  `JSX.Element | null`, when it can render nothing); a context is read with
  `use(SomeContext)` and provided as `<SomeContext value={…}>`; an effect reads
  fresh props through `useEffectEvent`.
- A view file holds the page and its layout; the rows, cards and widgets it is
  built from go in the feature's `components/`, and the logic behind the copy
  (names, ages, grouping) in `utils/` as plain functions.
- An element that animates out stays mounted through its leave animation with
  `usePresence(isActive, exitMs)` from `@/ui`, styled as leaving while
  `isActive` is false, rather than `{isActive && …}`.
- `src/types` is only the backend contract, mirrored in Rust. A type only the
  UI uses lives next to the code that owns it, such as
  `features/speed/types.ts`.
- File names say what a file is. A component is PascalCase
  (`ThemeProvider.tsx`), a hook is camelCase starting with `use`
  (`useTheme.ts`), and everything else is kebab-case: contexts, utils and
  types (`theme-context.ts`), global stylesheets (`base.css`) and folders
  (`live-throughput/`).
- Imports come in three groups, each sorted: packages, then the app's own
  modules (`@/…`), then relative paths. `npm run lint -- --fix` sorts them.
  JSX is linted for accessibility (jsx-a11y's strict set); a deliberate
  exception is a line-level disable that says why. [✓ CHECKED by `eslint.config.js`]
- A comment says why: a reason, constraint or trap the code can't show. One
  that restates the code goes. Exports, props and type fields take `/** */`;
  implementation notes take `//`. Keep it short: a `//` note in at most 6
  lines, a `/** */` doc in at most 10, and anything longer in `docs/`. No
  divider comments, and a lint exception says why after `--`. [✓ CHECKED by `eslint/comments.mjs`, `eslint.config.js`], except whether it says why.

### Names and copy

- A boolean reads as a yes/no question: `isOpen`, `areEventsLoading`,
  `hasGradient`, `canRunTest`, `shouldShowLabel`, `wasDeclined`, or a verb
  phrase (`needsNetworkInfo`). That covers props, `useState` pairs
  (`[isOpen, setIsOpen]`), params, fields and module constants (`IS_MAC`).
  Names the DOM or a library picks keep theirs: alias Recharts' `active` to
  `isActive` where you read it. [✓ CHECKED by `eslint.config.js`]
- Data that's shared and must not change (a context value, a list passed
  down as a prop, a module-level table) can be typed `readonly T[]`,
  `ReadonlyMap` or `Readonly<…>`, so the compiler catches a stray mutation.
- An object shape is a `type`, never an `interface`, so a shape that grows
  into a union or an intersection keeps its keyword. [✓ CHECKED by `eslint.config.js`]. A prop it
  redeclares from a base is omitted from the base
  (`Omit<HTMLAttributes<HTMLElement>, 'children'> & {…}`), or the docs drop it.
- Inline items are separated by `DotSeparator` or `InlineMeta`, never a typed
  `·` or `•`. A string that would join parts with ` · ` returns the parts.
  [✓ CHECKED by `eslint.config.js`]
- A missing value is `NoValue`, never a typed `—`. A formatter returns null
  for one, and the caller renders the bar. [✓ CHECKED by `eslint.config.js`]
- Copy never punctuates with an em dash: write two short sentences or
  rephrase. [✓ CHECKED by `eslint.config.js`]
- In-app hints (help tooltips, `*_HINT` constants, empty and unsupported
  states) are two short sentences at most, about 20 words: what's measured and
  the one or two limits that matter. How it works belongs in the README.

### Styles: Tailwind utilities from the design tokens

DESIGN.md says which token to use for what, and its rules (a token, never a
raw value; the spacing and radius scales; a text style, never a size alone)
apply here. This section is how they're written as Tailwind utilities.

- Components are styled with Tailwind v4 utilities in the TSX. The theme in
  `src/styles/tailwind.css` is built only from the tokens, so `p-12` is
  `--spacing-12`, `text-md` is `--font-size-md` and `bg-surface` is
  `--bg-surface`; there are no Tailwind defaults to reach for. There's no
  preflight: `styles/base.css` is the reset.
- A token is its utility: `p-12`, not `p-[12px]`; `rounded-sm`, not
  `rounded-[8px]`; `duration-(--duration-fast)`. A gap built from tokens is a
  `calc()` of them. A raw value that has to stay (the QR code's white plate, a
  gap set by an icon's ink, the About tile's app-icon corner) goes in
  `scripts/checks/raw-values.mjs`'s `ALLOWED` list, with why; DESIGN.md's
  Spacing and shape says which reasons count. [✓ CHECKED by `checks/raw-values.mjs`]
- Text takes a Figma text style's class from rove-tokens' `text-styles.css`
  (`type-caption`, `type-label-field`, `type-number-default`, …) and a colour
  utility: `type-caption text-tertiary`. The classes set no colour and sit
  under every utility, so `font-medium`, `leading-[1.2]` or the `num` face
  beside one wins; a size utility never goes beside one. Text with no
  matching style (13px at 500 is Body/Default plus `font-medium`) takes the
  nearest style at its size and a utility for the rest. A style sets its own line height, so text
  that should keep its line's (a timeline row's `*:leading-[1.3]`, a
  button's) adds `leading-[inherit]`. A stylesheet sets all four of a style's
  `--type-<style>-*` variables. Text no style fits at all goes in
  `scripts/checks/text-styles.mjs`'s `ALLOWED` list, with why. [✓ CHECKED by `checks/text-styles.mjs`]
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
  adjusts a child. `cx` only joins fixed classes. tailwind-merge groups the
  theme's names and `type-*` classes from `cn-theme.gen.json`, so after a new
  theme name or text style, `npm run gen`. [✓ CHECKED by `gen/cn-theme.mjs`]
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
  `inline-meta-item` classes for it. [✓ CHECKED by `checks/ui-classname.mjs`]
- Animations are theme entries in `tailwind.css` (`animate-menu-in`), with
  their keyframes.
- A `.module.css` file holds only what utilities can't say, selectors into
  another component's DOM keyed on `:has()`, and sits beside its component
  with the same name (`ConnectionStrip.module.css`).

### Tests

- Pure logic in a `utils/` folder has unit tests beside it, named after its
  module plus `.test` (`chart-scale.test.ts`). They run in Node and never touch
  the DOM or the bridge, so keep logic worth testing out of components and
  hooks.
- Components have DOM tests beside them (`Button.test.tsx`), rendered into
  happy-dom with Testing Library (set up in `src/ui/testing/`). They test
  behaviour and accessibility: roles, names, keyboard, focus, disabled.
- Every story is a test too. It renders in headless Chromium with the real
  styles, runs its `play` function and fails on any accessibility violation
  (`@storybook/addon-vitest`). Storybook's testing widget runs them from the
  sidebar; `npx vitest --project=storybook` runs them alone. A new machine
  needs `npx playwright install chromium` once.
- All three kinds run with `npm test`, part of `npm run check`.
- Looks are checked by pixels, and every screen and dialog by axe, outside
  `npm test`. `npm run screenshots -- --stable` pauses the clock, randomness
  and animations, so two runs of the same code match exactly, and also shoots
  open menus, dialogs, tooltips, a focus ring and every component's All States
  story. AGENTS.md's Check your work has the commands for each change.

## Validation

### What's enforced

`npm run check` fails on these, so a rule here needs no review. Each check in
`scripts/checks/` says what it guards.

| Rule | Enforced by |
| --- | --- |
| Library and context import boundaries, no raw `<button>` | ESLint, `no-restricted-imports` and `no-restricted-syntax` |
| No typed `·`, typed `—` or em dash in copy | ESLint, `no-restricted-syntax` |
| Boolean prefixes, `type` over `interface`, import order, jsx-a11y | ESLint |
| Comments: length, and a reason on every lint exception | ESLint, `scripts/eslint/comments.mjs` and eslint-comments |
| Layout | Prettier |
| Tokens, not raw values; gaps, paddings and margins on the spacing scale, corners on the radius scale | `checks/raw-values.mjs` |
| Every custom property read (`var(--…)`, `p-(--…)`) is defined: no misspelt token | `checks/custom-properties.mjs` |
| Text takes a text style (`type-*`, or a style's `--type-*` variables), never a font size alone | `checks/text-styles.mjs` |
| Every text, status and accent token clears WCAG AA on the backgrounds DESIGN.md puts it on, in both themes | rove-tokens' `checks/contrast.mjs`, before a release |
| Every theme name known to `cn` | `gen/cn-theme.mjs --check`: `cn-theme.gen.json` fresh |
| `className` only places a library component | `checks/ui-classname.mjs` |
| `components.gen.json` fresh; doc comments and `figma-components.json` entries present | `gen/components.mjs --check` |
| A component with a handler prop has a story that drives it (`play`, tagged `!autodocs`) | `gen/components.mjs --check` |
| Figma and the library agree: `figma-components.json`'s nodes and names, every variant property and its values, and every usage guide's sections, line counts and named alternatives (skipped without `FIGMA_TOKEN`) | `checks/figma-library.mjs` |
| Behaviour, and accessibility per story | `npm test` |

### What review catches

Every rule without the tag is judgment. These slip through most often:

- a prop passed only to pass it down, focus code where `navigate` already
  moves it, or an exit animation unmounted early instead of `usePresence`;
- a comment that restates the code instead of saying why;
- a hint over two short sentences, or one that explains how it works;
- the light theme, and any screen: Chromatic snapshots only stories, in dark,
  so read `npm run screenshots` in both themes;
- a screen, subpage or dialog without `npm run a11y`, which no check runs;
- Figma out of sync beyond its variants and guides (a component's spacing, a
  guide line's wording).
