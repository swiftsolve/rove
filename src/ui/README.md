# Rove UI library

How `src/ui`, the component library, is built: the Figma components in code.
The app's rules (styles, tests, which component to use) are in
[src/README.md](../README.md), and its ✓ CHECKED tags mean the same here.

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
  the same groups in the same order.
- An overlay stacks on a named layer from `utils/layers`, the one stacking
  order. A wash in any colour or neutral is `utils/tint`, which IconTile and
  TimelineNode share.

### Stories

- Each component has stories beside it (`Button.stories.tsx`), titled by its
  group (`Actions/Button`), in the same change as the component. Stories
  import the library by relative path, like the library itself.
- A title's last part is the component's key in `figma-components.json`, so
  Storybook's Figma tab finds its Figma component with nothing set.
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
  label and icon."), shown under its name above the doc comment.
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
- `components.gen.json` is the library's API in one file: each component's
  group, doc comment, props, Figma component, story ids and usage guide.
  `npm run gen` writes it from the code and `figma-components.json`, so a
  change goes in those and the file is regenerated. Every component and prop
  of its own has a doc comment, and every component an entry in
  `figma-components.json`. [✓ CHECKED by `gen/components.mjs`]
- Figma matches the library: each entry's node and name, every variant
  property and its values, and the usage guide's When to use and When not to
  use, line for line. [✓ CHECKED by `checks/figma-library.mjs`, skipped
  without `FIGMA_TOKEN`]

### Every component

- A component that renders one element takes its element's props
  (`ComponentProps<'button'>`) and passes `ref` and the rest through, so any
  can be a Tooltip's trigger or take an `aria-*`. In React 19 `ref` is a plain
  prop, so it passes through with the rest, without `forwardRef`.
- A status line is announced from a region that's always mounted, changing
  only its text: a region that mounts already holding its text often isn't
  read. TextField's feedback and PageHeader's `status` work this way, and
  `ScreenReaderStatus` is one for words only a screen reader hears.
- Variant, tone and size are separate axes of its CVA recipe, so they
  combine: `<Button variant="solid" tone="negative">`, not a `danger` variant.
- State that changes at runtime (open, checked, highlighted, invalid) is a
  `data-*` attribute on the element, styled with its variant, as Base UI does:
  Toggle's `data-checked:bg-accent`. Props pick variants through the recipe.
- Composition happens through compound parts and slots, so a parent passes a
  child what it needs as props, never through `cloneElement` or its DOM:
  `<Card><CardHeader title={title} icon={icon} /><CardBody>…</CardBody></Card>`,
  with a header's controls in its `actions` slot.
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
