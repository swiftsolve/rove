---
name: add-library-component
description: Add a new component to Rove's UI library in src/ui, in code and in the Rove Design System Figma file, or change an existing one's API or look. Use when a feature needs markup no library component covers, or a component needs a new prop, variant or style.
---

# Add or change a library component

The library's rules (stories, docs pages, what every component does) are in
`src/ui/README.md`, which loads with any file under
`src/ui/`. These are the steps.

## Before you start

- Read `src/ui/components.gen.json` for a component that already fits, or one
  that needs only a variant. A variant on an existing component beats a new one.
- Name it, and its props, the way the library does (`variant`, `tone`,
  `isDisabled`, `description`, `actions`; `src/ui/README.md`: Every component). The
  Figma component takes the same name, in sentence case.

## Add one: the code side

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
6. `npm run gen`, and raise `UI_LIBRARY_VERSION` in `src/ui/version.ts`
   (a new component is an API change).

## Change one: the code side

1. Change the code, its doc comments, and its stories and usage guide if its
   use changed.
2. `npm run gen`, and raise `UI_LIBRARY_VERSION` for an API change.
3. For a change meant to look the same, diff `npm run screenshots -- --stable`
   from before and after.

## As you go

- Run its folder's tests in seconds:
  `npx vitest run --project=storybook --project=dom src/ui/<folder>`.
- The catalogue check (`npm run gen`, then `npm run check`) says what's
  missing: a doc comment, a usage guide, a `play` story for a handler, a
  version bump. Fix what it names rather than guessing.
- Look at every story in Storybook (`npm run storybook`) in both themes before
  the Figma side.

## The Figma side

The component lives on its group's page in the Rove Design System file
(`src/ui/figma.json` has its URL; the file key is the part after `/design/`).

What you need:

- **The Figma MCP server**, connected (in Claude Code, the claude.ai Figma
  connector). Its `use_figma` tool runs Figma Plugin API JavaScript inside the
  file: that's how an agent builds components and edits doc pages. Call its
  `create_session` with the file key first, and pass the session id to every
  call after.
- **Figma's skills** `figma-use` (Plugin API rules; required before any
  `use_figma` call) and `figma-generate-library` (components, variants and
  variable bindings). They come with Figma's Claude Code plugin, as
  `figma:figma-use` and `figma:figma-generate-library`, and the MCP server also
  serves them (`skill://figma/figma-use/SKILL.md`) when the plugin isn't
  installed. Load both before the first `use_figma` call.

Without the server, stop after the code side and say the Figma side is left.

1. Build or change it from the file's variables and text styles, never raw
   values, with the same props and variants as the code.
2. Give a new one a docs section like its neighbours': intro (the stories'
   `docs.subtitle`), Guidance (the stories' guide, worded for designers, line
   for line), Dark and Light previews, and a properties table. A changed one's
   section changes with it.
3. Its entry in `src/ui/figma.json` (`null` when Figma has none): `name` and
   `node` are the Figma component's (or component set's) name and the id in
   its link's `node-id`, with `-` as `:`; never guess one. Map the component
   set, not one of its variants. A prop with values Figma has no variant for
   goes in the entry's `noFigmaVariant`, a Figma variant code derives from
   other props in `noCodeProp`, each with why.

## Done

- `npm run check` passes, with `FIGMA_TOKEN` in `.env.local` so
  `checks/figma.mjs` holds the names, variants, values and guides to the file.
- A screenshot of the Figma docs section matches the stories.
- Commit, then run the `resync-sites` skill: the Storybooks change, and the
  demo too if a screen uses the component.
