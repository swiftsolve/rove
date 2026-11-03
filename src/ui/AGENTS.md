# src/ui

The component library: the Figma components in code. The rules are in
`docs/develop/frontend.md` (The UI library, Components), and `npm run lint` enforces
most of them. These are the ones it can't check:

- Read `components.gen.json` for the library's API before reading the source.
- A new component gets its stories in the same change. A part with props of
  its own gets its own stories file beside its module.
- An interactive component gets a story that drives it with a `play`
  function, named for the interaction and tagged `!autodocs`.
- Raise `UI_LIBRARY_VERSION` in `version.ts` when the library's API changes.
- A design change lands in Figma, the `rove-tokens` build, this code and
  `docs/develop/frontend.md` in the same task.
- A change a user would see is resynced to both sites after committing.

The last two are spelled out in the root `AGENTS.md`.
