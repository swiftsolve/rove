# src/ui

The component library: the Figma components in code. The rules are in
`docs/develop/frontend.md` (The UI library, Components). A rule marked
*Checked* fails `npm run check`; an unmarked one is yours to watch.

- Read `components.gen.json` for the library's API, and which component to
  pick, before reading the source.
- Check a component as you go, in seconds: `npx vitest run --project=storybook
  --project=dom src/ui/<folder>` runs its stories (play functions, axe) and
  DOM tests. Then look at it in Storybook (`npm run storybook`) in both
  themes: no test sees a wrong shade or a cramped gap.
- A new component gets its stories, with a usage guide (`guidance`), in the
  same change. *Checked: the catalogue.* Its Figma docs section gets the same
  guide, worded for designers but line for line. *Checked: `checks/figma.mjs`.*
  A part with props of its own gets its own stories file beside its module.
- A component that takes a handler (`onClick`, `onBack`) gets a story that
  drives it with a `play` function, tagged `!autodocs`. *Checked: the
  catalogue.* Name it for the interaction ("Pressing", "GoingBack") and
  assert what its guide promises, not just that the handler ran.
- Raise `UI_LIBRARY_VERSION` in `version.ts` with an API change: major for a
  removed or renamed component or prop, minor for an addition. *Checked: the
  catalogue fails a changed API on an unchanged version; picking major or
  minor is yours.*

The root `AGENTS.md`'s Done means applies here too: the Figma sync and the
site resync are in it.
