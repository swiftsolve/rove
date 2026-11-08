# Rove frontend

How the React UI in `src/` is organised, styled and tested. Which token to use
is in `rove-tokens`' [DESIGN.md](../node_modules/@swiftsolve/rove-tokens/DESIGN.md),
and the library has its own guide, [src/ui/README.md](ui/README.md).

**[✓ CHECKED by `file`]** marks a rule `npm run check` enforces. The file it
names is the check (`checks/`, `gen/` and `eslint/` are in `scripts/`), and
says what it guards. A rule without the tag is judgment:
[What review catches](#what-review-catches) lists the ones that slip most.

## Rules

### Components

Each Figma component has a counterpart in the library: build from these before
writing new markup. Which one to use, and its props, variants and usage guide,
are in `src/ui/components.gen.json`: read it first, not the sources. For how
one is used, read its stories, beside its source (`Link.stories.tsx`). Each
project JSON file has a schema in `schemas/`, `<name>.schema.json`, that says
what every key means, and the generators fail on a file that breaks it.
[✓ CHECKED by `gen/components.ts`, `gen/cn-theme.ts`]

- Icons come from `@/ui` (`<HomeIcon />`; the brand mark is `<BrandIcon />`).
  A new one joins the library, in `src/ui/icons/`.
- The app fills the frame's parts: `AppTitleBar` the title bar, and `TabBar`
  the nav rail, from the tab registry.
- Figma's Compositions pages hold what features build from the library, a
  page per app page that shows them, like `ThroughputChart` on Home
  (`features/live-throughput`) and `Sparkline` on Services
  (`features/services`). They live with their feature, not in `src/ui`.

### State: context, not prop drilling

- Props are a component's own inputs: the item a row shows, a dialog's
  `onClose`. Every view renders with no props.
- App-wide state comes from context, read where it's used: `useNavigation()`
  (location, `navigate`, `back`), `useTheme()`, `useNetwork()` (network info),
  `useInternetStatus()` and `useConnectionStatus()` (the title bar's verdict).
  `NetworkProvider` fetches network info and internet status once for the
  app. Each context is small, so a reader re-renders only when its value
  changes.
- `navigate` handles focus, so a row, card or link that opens a screen just
  calls it:
  - a new screen focuses its h1;
  - going back (the Back button or history) lands on the control that opened
    the screen, scrolled to where it was, ringed only if it was reached by
    keyboard.
- Backend data comes from TanStack Query:
  - each feature owns its data hooks in `hooks/` (`useDevices`,
    `useDataUsage`, …), built on `useBackendQuery`, and the components that
    show the data call them directly;
  - callers of one hook share its cache entry, so `DevicesView` and
    `DevicesCard` see the same scan;
  - live throughput and the speed test are event streams, not reads, so each
    keeps a module store read with `useSyncExternalStore`.
- A query key names the data, plus the network for data that belongs to one
  (`['devices', networkKey]` from `useNetworkKey()`), so a new network gets
  fresh results. A query fetches while a screen that shows it is open; its
  hook's comment says when it polls and why.
- The UI library in `src/ui` takes only props, so it reads no app context
  ([the library guide](ui/README.md)).

### Where code goes

- `app/` and every feature use the same subfolders: `components/`,
  `context/` (providers and their context objects), `hooks/` and `utils/`.
  Code outside a `context/` or `hooks/` folder reads a context through its
  hook, never its object, and only that context's provider and hook import
  it. [✓ CHECKED by `eslint.config.js`, outside those folders]
- `TABS` (`app/utils/tab-registry.ts`) holds each tab's label, rail icon and
  placement, screen and subpages; `TabBar` and `CurrentScreen` read it.
- A custom hook lives in its own file in a `hooks/` folder.
- React 19 idioms:
  - a component's return type is inferred, annotated only as
    `JSX.Element | null` when it can render nothing;
  - a context is read with `use(SomeContext)` and provided as
    `<SomeContext value={…}>`;
  - an effect reads fresh props through `useEffectEvent`, so they stay out of
    its deps (`useOnNetworkChanged`'s callback).
- A view file holds the page and its layout; the rows, cards and widgets it is
  built from go in the feature's `components/`, and the logic behind the copy
  (names, ages, grouping) in `utils/` as plain functions.
- An element that animates out stays mounted through its leave animation with
  `usePresence(isActive, exitMs)` from `@/ui`, styled as leaving while
  `isActive` is false: `ScanStatus` renders while `isMounted`, with
  `scanVariants({ isLeaving: !isActive })`.
- `src/types` is only the backend contract, mirrored in Rust. A type only the
  UI uses lives next to the code that owns it, such as
  `features/speed/types.ts`.
- File names say what a file is. A component is PascalCase
  (`ThemeProvider.tsx`), a hook is camelCase starting with `use`
  (`useTheme.ts`), and everything else is kebab-case: contexts, utils and
  types (`theme-context.ts`), global stylesheets (`base.css`) and folders
  (`live-throughput/`).
- A comment says why: a reason, constraint or trap the code can't show, so a
  divider has nothing to say.
  - Exports, props and type fields take `/** */`; implementation notes take
    `//`.
  - A `//` note runs at most 6 lines and a `/** */` doc at most 10; anything
    longer goes in `docs/`. [✓ CHECKED by `eslint/comments.ts`]
  - A lint exception is a line-level disable that says why after `--`.
    [✓ CHECKED by `eslint.config.js`]

### Names and copy

- A boolean reads as a yes/no question: `isOpen`, `areEventsLoading`,
  `hasGradient`, `canRunTest`, `shouldShowLabel`, `wasDeclined`, or a verb
  phrase (`needsNetworkInfo`). [✓ CHECKED by `eslint.config.js`]
  - It covers props, `useState` pairs (`[isOpen, setIsOpen]`), params, fields
    and module constants (`IS_MAC`), in `src/` and `scripts/` alike.
  - A name the DOM or a library picks keeps its name: alias Recharts' `active`
    to `isActive` where you read it.
- Data that's shared and must not change (a context value, a list passed
  down as a prop, a module-level table) can be typed `readonly T[]`,
  `ReadonlyMap` or `Readonly<…>`, so the compiler catches a stray mutation.
- An object shape is a `type`, so a shape that grows into a union or an
  intersection keeps its keyword.
  [✓ CHECKED by `eslint.config.js`]
- A prop a type redeclares from a base is omitted from the base
  (`Omit<HTMLAttributes<HTMLElement>, 'children'> & {…}`), or the docs drop it.
- Inline items are separated by `DotSeparator` or `InlineMeta`, so a string
  that would join parts with a separator returns the parts:
  `<InlineMeta items={[name, connection.band]} />`.
  [✓ CHECKED by `eslint.config.js`]
- A missing value renders `NoValue`: a formatter returns null for one, and the
  caller renders it (`ping?.value ?? <NoValue label="Not measured" />`). [✓ CHECKED by `eslint.config.js`]
- Copy punctuates with full stops, commas and colons: where an em dash would
  go, write two short sentences or rephrase. [✓ CHECKED by `eslint.config.js`]
- In-app hints (help tooltips, `*_HINT` constants, empty and unsupported
  states) are two short sentences at most, about 20 words: what's measured and
  the one or two limits that matter: "Tests this computer’s connection, Wi-Fi
  included. One test can use over 1 GB on fast links." How it works belongs
  in the README.

### TypeScript

These hold in `src/` and `scripts/` alike.

- A cast (`as`) says what the compiler can't prove, so it stays where a value
  comes in from outside: parsed JSON, `history.state`, an event's target, a
  page's `window`. A test fixture built partial on purpose, and a style object
  that sets a custom property (React's `CSSProperties` has no `--name`), may
  cast too. A double cast (`as unknown as`) says why beside it.
- A data file's shape is one named type that every reader imports, like
  `scripts/lib/library-json-types.ts`, not a shape written again inline.
- A value of more than two parts is an object, read by name. A table of rows
  (fixtures, scenarios) may stay tuples when its type labels each element:
  `[name: string, downMb: number, upMb: number][]`.
- Only syntax that type stripping can erase: no `enum`, `namespace` or
  constructor parameter properties, so `scripts/` runs as is under Node.
  [✓ CHECKED by `tsconfig.json`, `scripts/tsconfig.json`]

### Styles: Tailwind utilities from the design tokens

DESIGN.md says which token to use for what, and its rules (a token, never a
raw value; the spacing and radius scales; a text style, never a size alone)
apply here. This section is how they're written as Tailwind utilities.

- Components are styled with Tailwind v4 utilities in the TSX. The theme is
  `rove-tokens`' `tailwind-theme.css`, generated from the tokens and imported
  by `src/styles/tailwind.css`, so `p-12` is
  `--spacing-12`, `text-sm` is `--font-size-sm` and `bg-surface` is
  `--bg-surface`; there are no Tailwind defaults to reach for. There's no
  preflight: `styles/base.css` is the reset.
- A token is its utility: `p-12`, not `p-[12px]`; `rounded-sm`, not
  `rounded-[8px]`; `duration-(--duration-fast)`. A gap built from tokens is a
  `calc()` of them. [✓ CHECKED by `checks/raw-values.ts`]
  - A raw value that has to stay (the QR code's white plate, a gap set by an
    icon's ink, the About tile's app-icon corner) goes in
    `scripts/checks/raw-values.ts`'s `ALLOWED` list, with why. DESIGN.md's
    Layout says which reasons count.
- Text takes a text style's class and a colour utility:
  `type-caption text-tertiary`. [✓ CHECKED by `checks/text-styles.ts`]
  - The classes (`type-caption`, `type-body-medium`, `type-body`, …)
    come from `rove-tokens`' `text-styles.css`, set no colour, and sit under
    every utility, so `font-medium`, `leading-[1.2]` or the `num` face beside
    one wins. A size utility stays off them.
  - Text with no matching style takes the nearest style at its size and a
    utility for the rest: 11px at 500 is Caption plus `font-medium`.
  - A style sets its own line height, so text that keeps its line's (a
    timeline row's `*:leading-[1.3]`, a button's) adds `leading-[inherit]`.
  - A stylesheet sets all four of a style's `--type-<style>-*` variables.
  - Text no style fits at all goes in `scripts/checks/text-styles.ts`'s
    `ALLOWED` list, with why.
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
  theme name or text style, `npm run gen`. [✓ CHECKED by `gen/cn-theme.ts`]
- A view adjusts a shared component through its variants (`density`,
  `align`, `shouldTruncate`, `CardBody`'s `layout`); a tweak more than one
  view needs becomes a new variant.
- `className` on a library component places it in a layout: margin,
  position, z-index, size, flex or grid item, its own text alignment, rounding
  to fit its container, showing or hiding it.
  [✓ CHECKED by `checks/ui-classname.ts`]
  - Padding, inner layout, type, colour or surface is a missing variant, or a
    style for an element the view owns: a card that lays out its own content
    does it in a `<div>` inside the Card. InlineMeta and MetricValue take
    their type from the line they sit in.
  - Icons (coloured by `className`) and the unstyled `CollapsibleTrigger` are
    exempt.
  - A `:has()` selector in a `.module.css` (below) may reach in; InlineMeta
    keeps its `inline-meta` and `inline-meta-item` classes for it.
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
  (`@storybook/addon-vitest`). A new machine needs
  `npx playwright install chromium` once.
- Looks and screen-level axe run outside `npm test`: AGENTS.md's Check your
  work has the commands. `npm run screenshots` also shoots open menus,
  dialogs, tooltips, a focus ring and every component's All States story.

## Validation

### What review catches

These judgment rules slip through most often:

- a prop passed only to pass it down, focus code where `navigate` already
  moves it, or an exit animation unmounted early instead of `usePresence`;
- a comment that restates the code instead of saying why;
- clever code whose comment doesn't say why the plain version wasn't enough
  (AGENTS.md: Write plain code);
- a hint over two short sentences, or one that explains how it works;
- the light theme, and any screen: Chromatic snapshots only stories, in dark,
  so read `npm run screenshots` in both themes;
- a screen, subpage or dialog without `npm run a11y`, which no check runs;
- Figma out of sync beyond its variants and guides (a component's spacing, a
  guide line's wording).
