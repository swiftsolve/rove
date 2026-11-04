# Rove UI library

How `src/ui`, the component library, is built: the Figma components in code.
`src/ui/AGENTS.md` imports it, so Claude Code loads it with the first file
under `src/ui/`, beside [frontend.md](frontend.md), which covers the app,
styles, tests and which component to use. A rule marked *Checked* fails
`npm run check`; frontend.md's [What's enforced](frontend.md#whats-enforced)
names the check.

- [Add a library component](#add-a-library-component) and
  [change one](#change-a-library-component)
- [The library](#the-library), [Stories](#stories),
  [Docs pages and the catalogue](#docs-pages-and-the-catalogue),
  [Rules every component follows](#rules-every-component-follows) and
  [Buttons](#buttons)

Each checklist ends in the checks for it. After the commit, the Storybooks
need a resync: the `resync-sites` skill (`.claude/skills/resync-sites/SKILL.md`).
The `add-library-component` skill runs the whole of the first, Figma included.

## Add a library component

1. A kebab-case folder at the top of `src/ui` holding `Name.tsx`. A component
   that renders one element takes `ComponentProps<'div'>` (its element's).
   Styles are a CVA recipe; its defaults go in `defaultVariants` and in the
   destructured props.
2. A doc comment on the component and on each prop of its own.
3. An export from `src/ui/index.ts`, under its group's comment.
4. Stories beside it (`Name.stories.tsx`), titled by its group
   (`Data display/Name`), with an `AllStates` story when it has several states,
   a usage guide, and a `play` story if it takes a handler.
5. A DOM test beside it (`Name.test.tsx`) for its behaviour and accessibility.
6. Its entry in `src/ui/figma.json` (`null` when Figma has none). The entry's
   `name` and `node` are the Figma component's (or component set's) name and
   the id in its link's `node-id`, with `-` as `:`; never guess one. Map the
   component set, not one of its variants. A prop with values Figma has no
   variant for goes in the entry's `noFigmaVariant`, a Figma variant code
   derives from other props in `noCodeProp`, each with why. With `FIGMA_TOKEN`
   in `.env.local` (or in CI), `npm run check` holds the names, variants and
   values to the file.
7. `npm run catalogue`, and raise `UI_LIBRARY_VERSION` (a new component is an
   API change).
8. The Figma side: the component on its group's page in the Figma file, with
   the same props and variants, and its docs section.

Check: `npm run check`, then `npm run storybook` to look at it in both themes.

## Change a library component

1. Change the code, its doc comments, and its stories and usage guide if its
   use changed.
2. `npm run catalogue`, and raise `UI_LIBRARY_VERSION` for an API change.
3. The same change in Figma.

Check: `npm run check`. For a change meant to look the same, diff
`npm run screenshots -- --stable` from before and after.

## The library

`src/ui` is the component library: the Figma components in code. Features
import it from `@/ui` and nothing else under `src/ui`. The library imports only
itself (by relative path) and packages, never app code. *Checked.*

The library keeps its own version, apart from the design system's:
`UI_LIBRARY_VERSION` in `version.ts`, which Storybook's name shows after "Rove
Components". Raise it when the library's API changes: major
for a removed or renamed component or prop, or a narrower type; minor for
anything added. *Checked* that it changes; picking major or minor is yours.

- Each component has its own kebab-case folder at the top of `src/ui`, with
  its tests (`button/` holds Button and IconButton). There are no tiers: a
  component that starts using another stays where it is.
- `index.ts`, the stories and the Figma file's component pages group them by
  purpose, in this order:
  - Actions: button, link and menu
  - Inputs: text-field, toggle and segmented-control
  - Overlays: dialog and tooltip
  - Status and feedback: badge, status-dot, spinner, loading-state,
    banner and empty-state
  - Data display: data-list, readout, metric-value, no-value, bar-meter,
    split-bar, list-row, icon-tile and timeline
  - Containers: card, collapsible and separator
  - App frame: title-bar, nav-rail and page-header
  - Accessibility: screen-reader

  Figma has one more page after them, Patterns: the cards, charts and
  content that features build from the library.
- Beside them: `utils/` (`cn`; `pressable`, the behaviour everything
  pressable shares; `layers`, the one stacking order, so an overlay picks a
  named layer rather than a z-index; and `tint`, the "any colour or neutral"
  wash IconTile and TimelineNode share), `hooks/` (generic UI hooks),
  `context/` (where dialogs portal), `icons/`, and `testing/` (the DOM tests'
  setup).

## Stories

- Each component has stories beside it (`Button.stories.tsx`), titled by its
  group (`Actions/Button`), in the same change as the component. Stories
  import the library by relative path, like the library itself.
- A family sits in a folder named for its parent (`Containers/Card/CardHeader`),
  and the parent's page shows its parts' props as tabs (`subcomponents`). A
  part with props of its own (`CardBody`, `NavItem`) gets its own stories file
  beside its module (`card/CardBody.stories.tsx`), so its props have controls,
  which subcomponent tabs can't give. The order within a folder is set in
  `.storybook/preview.tsx`.
- A component that takes a handler (`onClick`, `onChange`, `onBack`) has a
  story that drives it with a `play` function and asserts what its guide
  promises: keyboard, focus, the callbacks, a disabled one ignoring a press.
  Name it for the interaction (`Pressing`, `EscapeCloses`) and tag it
  `!autodocs`, since moving focus would scroll its Docs page. A play that
  leaves the story as it found it (`DisabledOff`) can stay on the Docs page.
  *Checked.*
- `npm run storybook` serves them at `localhost:6006`, with a Theme switch in
  the toolbar (Docs pages follow it) and an accessibility check on every
  story. Its Figma tab embeds the component from the design file: a story
  title's last part is its key in `figma.json`, so a new component's stories
  find it with nothing set. `npm run build:storybook` writes a static copy to
  `storybook-static/`. Master's is hosted at
  <https://rove.swiftsolve.net/storybook/> (synced by hand: the `resync-sites` skill),
  and every push publishes to Chromatic for visual tests.

## Docs pages and the catalogue

- A component's intro is one sentence on what it is, with no rules: the
  stories' `docs.subtitle` ("A headline number and its unit, with an optional
  label and icon."), shown under its name above the doc comment, and the same
  sentence under its name in Figma's docs section.
- Its usage guide is the stories' `guidance` parameter (`Guidance` in
  `.storybook/docs-page.tsx`), with `docs: { toc: GUIDANCE_TOC }` beside it.
  Every component has one, written for its whole family (Card's covers
  CardHeader and the rest). *Checked.* It has three parts, a few words a line:
  - When to use: a situation, then how if it needs saying, then an example
    ("The page’s main action, solid: “Run test”.").
  - When not to use: a situation, then what to use instead ("Opening another
    view or an address: use `Link`.").
  - Accessibility, for developers: Built in names the element, roles and
    keyboard; To handle, the props and markup to supply.

  A rule that isn't a situation goes in the doc comment instead, and what the
  stories and props table already show (each state, each variant) stays out.
- Figma's docs section carries the same guide under its intro, worded for
  designers: When to use and When not to use line for line (*Checked*), and
  Accessibility as what they needn't draw (Built in) and what they decide or
  note (To handle). Only Figma has a Guidelines block, Do and Don't columns
  for placement, variants and content, each Don't the mistake its Do
  prevents; code covers that in its props table and doc comments.
- `components.gen.json` is the library's API in one file, for agents and
  people: each component's group, doc comment, props (type, variant values,
  default), Figma component, story ids and usage guide. Read it, not the
  sources, to learn the API or pick a component. `npm run catalogue` writes it
  from the code and `figma.json`, which names each component's Figma
  component and node (`null` when Figma has none).

## Rules every component follows

- It takes `className` for its place in a layout.
- A component that renders one element takes its element's props
  (`ComponentProps<'button'>`) and passes `ref` and the rest through, so any
  can be a Tooltip's trigger or take an `aria-*`. No `forwardRef`: in React 19
  `ref` is a prop.
- A status line is announced from a region that's always mounted, changing
  only its text: a region that mounts already holding its text often isn't
  read. TextField's feedback and PageHeader's `status` work this way, and
  `ScreenReaderStatus` is one for words only a screen reader hears.
- Styles are CVA recipes, with variant, tone and size as separate axes.
- State is exposed as data attributes.
- Composition happens through compound parts and slots, never `cloneElement`
  or reaching into a child's DOM. The one exception is Tooltip, which joins
  its own description to one its trigger already has: Base UI lets the
  trigger's props win, so there's no other way to set both.
- Behaviour that's hard to get right comes from Base UI (`@base-ui/react`),
  styled with our tokens: focus traps, positioning, roving focus, dismissal,
  ARIA wiring. The library wraps it, so features never import Base UI
  directly.
- Props share names across components and with Figma: `variant`, `isLoading`,
  `isDisabled`, `isChecked`; the text under a title is `description` and the
  controls a component holds are `actions`; a colour by role is `status` or
  `tone` (`positive`, `warning`, `negative`, `neutral`); a quality rating is
  `level` (`excellent`, `good`, `fair`, `poor`).

## Buttons

Buttons are `Button`, `IconButton` and `Link`, never a hand-written
`<button>`. *Checked.*

- Disabled and loading swallow every activation, a form submit included, and
  keep the button focusable, so a tooltip can say why. They mark the element
  with `data-disabled` and `data-loading`.
- Everything pressable shares that behaviour through `ui/utils/pressable.ts`,
  and styles a hover or press that only applies while usable with the
  `usable:` variant (`usable:hover:bg-hover`).
