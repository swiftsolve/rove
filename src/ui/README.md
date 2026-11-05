# Rove UI library

How `src/ui`, the component library, is built: the Figma components in code.
The app's rules (styles, tests, which component to use) are in
[src/README.md](../README.md), and its ✓ CHECKED tags mean the same here.
Step-by-step tasks are skills, listed in [AGENTS.md](../../AGENTS.md).

## Rules

### The library

Features import the library from `@/ui` and nothing else under `src/ui`. The
library imports only itself (by relative path) and packages, never app code.
[✓ CHECKED by `eslint.config.js`]

- Each component has its own kebab-case folder at the top of `src/ui`, with
  its tests (`button/` holds Button and IconButton). There are no tiers: a
  component that starts using another stays where it is.
- `index.ts`'s group comments (Actions, Inputs, Overlays…) group them by
  purpose, and the stories' titles and the Figma file's component pages follow
  the same groups in the same order. Figma has one more page after them,
  Compositions: the cards, charts and content that features build from the
  library.
- Beside them:
  - `utils/`: `cn`; `pressable`, the behaviour everything pressable shares;
    `layers`, the one stacking order, so an overlay picks a named layer rather
    than a z-index; and `tint`, the "any colour or neutral" wash IconTile and
    TimelineNode share;
  - `hooks/`, generic UI hooks; `context/`, where dialogs portal; `icons/`;
    and `testing/`, the DOM tests' setup.

### Stories

- Each component has stories beside it (`Button.stories.tsx`), titled by its
  group (`Actions/Button`), in the same change as the component. Stories
  import the library by relative path, like the library itself.
- A family sits in a folder named for its parent (`Containers/Card/CardHeader`),
  and the parent's page shows its parts' props as tabs (`subcomponents`).
  - A part with props of its own (`CardBody`, `NavItem`) gets its own stories
    file beside its module (`card/CardBody.stories.tsx`), so its props have
    controls, which subcomponent tabs can't give.
  - The order within a folder is set in `.storybook/preview.tsx`.
- A component that takes a handler (`onClick`, `onChange`, `onBack`) has a
  story that drives it with a `play` function.
  [✓ CHECKED by `gen/components.mjs`]
  - It asserts what the guide promises: keyboard, focus, the callbacks, a
    disabled one ignoring a press.
  - It's named for the interaction (`Pressing`, `EscapeCloses`) and tagged
    `!autodocs`, since moving focus would scroll its Docs page. A play that
    leaves the story as it found it (`DisabledOff`) can stay on the Docs page.

### Docs pages and the component list

- A component's intro is one sentence on what it is, with no rules: the
  stories' `docs.subtitle` ("A headline number and its unit, with an optional
  label and icon."), shown under its name above the doc comment, and the same
  sentence under its name in Figma's docs section.
- Its usage guide is the stories' `guidance` parameter (`Guidance` in
  `.storybook/docs-page.tsx`), with `docs: { toc: GUIDANCE_TOC }` beside it.
  Every component has one, written for its whole family (Card's covers
  CardHeader and the rest). [✓ CHECKED by `gen/components.mjs`]

  It has three parts, a few words a line:
  - When to use: a situation, then how if it needs saying, then an example
    ("The page’s main action, solid: “Run test”.").
  - When not to use: a situation, then what to use instead ("Opening another
    view or an address: use `Link`.").
  - Accessibility, for developers: Built in names the element, roles and
    keyboard; To handle, the props and markup to supply.

  A rule that isn't a situation goes in the doc comment instead, and what the
  stories and props table already show (each state, each variant) stays out.
- Figma's docs section carries the same guide under its intro, worded for
  designers:
  - When to use and When not to use, line for line.
    [✓ CHECKED by `checks/figma-library.mjs`]
  - Accessibility, as what they needn't draw (Built in) and what they decide
    or note (To handle).
  - A Guidelines block, only in Figma: Do and Don't columns for placement,
    variants and content, each Don't the mistake its Do prevents. Code covers
    that in its props table and doc comments.
- `components.gen.json` is the library's API in one file, for agents and
  people: each component's group, doc comment, props (type, variant values,
  default), Figma component, story ids and usage guide. `npm run gen` writes it
  from the code and `figma-components.json`, which names each component's Figma
  component and node (`null` when Figma has none).

### Every component

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
  or reaching into a child's DOM.
  - The one exception is Tooltip, which joins its own description to one its
    trigger already has: Base UI lets the trigger's props win, so there's no
    other way to set both.
- Behaviour that's hard to get right comes from Base UI (`@base-ui/react`),
  styled with our tokens: focus traps, positioning, roving focus, dismissal,
  ARIA wiring. The library wraps it, so features reach Base UI only through
  `@/ui`.
- Props share names across components and with Figma:
  - `variant`, `isLoading`, `isDisabled`, `isChecked`;
  - the text under a title is `description`, and the controls a component
    holds are `actions`;
  - a colour by role is `status` or `tone` (`positive`, `warning`,
    `negative`, `neutral`);
  - a quality rating is `level` (`excellent`, `good`, `fair`, `poor`).

### Buttons

Outside the library, a button is one of its components (`Button`,
`IconButton`, `Link`, `ListRow`, `StretchedLink`), never a bare
`<button>`. [✓ CHECKED by `eslint.config.js`]

- Disabled and loading swallow every activation, a form submit included, and
  keep the button focusable, so a tooltip can say why. They mark the element
  with `data-disabled` and `data-loading`.
- Everything pressable shares that behaviour through `ui/utils/pressable.ts`,
  and styles a hover or press that only applies while usable with the
  `usable:` variant (`usable:hover:bg-hover`).

## Validation

src/README.md's [What's enforced](../README.md#whats-enforced) lists every
check, the library's included.

### Storybook

`npm run storybook` serves the stories at `localhost:6006`, with a Theme switch
in the toolbar (Docs pages follow it) and an accessibility check on every
story. Its Figma tab embeds the component from the design file: a story
title's last part is its key in `figma-components.json`, so a new component's
stories find it with nothing set. `npm run build:storybook` writes a static copy to
`storybook-static/`. Master's is hosted at
<https://rove.swiftsolve.net/storybook/>, synced on demand (the `resync-sites`
skill), and every push publishes to Chromatic for visual tests.
