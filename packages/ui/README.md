# Rove UI library

How `packages/ui/`, the component library, is built: the Figma components in code.
The app's rules (styles, tests, which component to use) are in
[apps/rove/src/README.md](../../apps/rove/src/README.md), and its ✓ CHECKED tags mean the same here.

## Rules

### The library

Features import the library from `@swiftsolve/rove-ui` and nothing else under `packages/ui/`. The
library imports only itself (by relative path) and packages, never app code.
[✓ CHECKED by `eslint.config.js`]

- Each component has its own kebab-case folder at the top of `packages/ui/`, with
  its tests (`button/` holds Button and IconButton). There are no tiers: a
  component that starts using another stays where it is.
- A family's folder is laid out like a feature's. Its main component sits at
  the top with its tests and stories, beside any independent sibling
  (IconButton). Each part that only works inside it is a file in
  `components/`, a context it shares is in `context/` with its provider, a
  hook only the family uses is in `hooks/`, and values its files share are in
  `utils/`: `card/components/CardHeader.tsx`, `card/context/card-context.ts`,
  `card/hooks/useCardContext.ts`, `nav-rail/utils/active-bar.ts`.
  - A context is read through its hook and provided by its provider, as in
    the app. [✓ CHECKED by `eslint.config.js`]
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
- A title's last part is the component's key in `components.gen.json`, so
  Storybook's Figma tab finds its Figma component with nothing set.
- A family sits in a folder named for its parent (`Containers/Card/CardHeader`),
  and the parent's page shows its parts' props as tabs (`subcomponents`).
  - A part with props of its own (`CardBody`, `NavItem`) gets its own stories
    file beside its module (`card/components/CardBody.stories.tsx`), so its
    props have controls, which subcomponent tabs can't give. A part without
    one takes its family's (`menu/Menu.stories.tsx`).
  - The order within a folder is set in `packages/ui/.storybook/preview.tsx`.
- A component that takes a handler (`onClick`, `onChange`, `onBack`) has a
  story that drives it with a `play` function.
  [✓ CHECKED by `gen/components.ts`]
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
  `packages/ui/.storybook/docs-page.tsx`), with `docs: { toc: GUIDANCE_TOC }` beside it.
  Every component has one, parts too: a part with its own Docs page
  (`Containers/Card/CardBody`) sets its own `guidance`, and a part shown on
  its family's page (MenuItem on `Actions/Menu`) has its guide in that page's
  `partGuidance`, by name, shown at the end of the page. The family's guide
  covers how the parts fit together; a part's, when to reach for that part.
  [✓ CHECKED by `gen/components.ts`]

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
  group, doc comment, props, Figma component, story ids and usage guide, its
  usage guide as Figma words it (`figmaGuidance`), and for a part, its family
  (`partOf`). `npm run gen` writes it from the code and the files beside it
  in `catalog/`, so a change goes in those and the file is regenerated. Every
  component and prop of its own has a doc comment; every component has a
  Figma component or a reason it has none; each Figma variant property is a
  prop with the same values; and each Figma guide has as many When to use and
  When not to use lines as the code's, and names the same alternatives, unless
  `figma-differences.json` says why not. [✓ CHECKED by `gen/components.ts`]
- `npx rove-ui` reads `components.gen.json` a component at a time, for an
  agent or a person: `list`, `show <Name>`, `search <words>`, `icons [text]`,
  each with `--json`, and for a person at a terminal, `pick` (a list that
  narrows as you type, from @clack/prompts). It lives in `cli/`, built on
  Commander, and Node runs it
  as .ts, so it reads the file as `npm run gen` last wrote it.
- `catalog/figma/` is exported from the Figma file by `npm run figma:export`:
  `components.json` (each component's Figma name, node and variant
  properties) and `guides.json` (the usage guides). Never edit them by hand:
  change Figma, export again, then `npm run gen`. A component's Figma
  component is the one named its code name in sentence case.
- `catalog/figma-differences.json` is kept by hand: a Figma name that isn't
  the sentence-case one, why a component has no Figma component, and each
  difference from Figma kept on purpose, with why (the
  `write-figma-differences` skill).
- The export matches the Figma file. [✓ CHECKED by `checks/figma-export.ts`,
  skipped without `FIGMA_TOKEN`]

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
  `@swiftsolve/rove-ui`.
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
