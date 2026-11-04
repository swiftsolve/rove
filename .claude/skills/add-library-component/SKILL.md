---
name: add-library-component
description: Add a new component to Rove's UI library in src/ui, in code and in the Rove Design System Figma file, or change an existing one's API. Use when a feature needs markup no library component covers, or a component needs a new prop or variant.
---

# Add a library component

The code side is `docs/develop/ui-library.md`: Add a library component (and
Change a library component). It loads with any file under `src/ui/`; follow it
step by step. This skill adds what that checklist leaves to you.

## Before you start

- Read `src/ui/components.gen.json` for a component that already fits, or one
  that needs only a variant. A variant on an existing component beats a new one.
- Name it, and its props, the way the library does (`variant`, `tone`,
  `isDisabled`, `description`, `actions`; ui-library.md: Rules every component
  follows). The Figma component takes the same name, in sentence case.

## The code side

Follow the checklist. As you go:

- Run its folder's tests in seconds:
  `npx vitest run --project=storybook --project=dom src/ui/<folder>`.
- The catalogue check (`npm run catalogue`, then `npm run check`) says what's
  missing: a doc comment, a usage guide, a `play` story for a handler, a
  version bump. Fix what it names rather than guessing.
- Look at every story in Storybook in both themes before the Figma side.

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

1. Build it from the file's variables and text styles, never raw values, with
   the same props and variants as the code.
2. Give it a docs section like its neighbours': intro (the stories'
   `docs.subtitle`), Guidance (the stories' guide, worded for designers, line
   for line), Dark and Light previews, and a properties table.
3. Put its name and node id in `src/ui/figma.json`; never guess an id.

## Done

- `npm run check` passes, with `FIGMA_TOKEN` set so `checks/figma.mjs` compares
  the variants and guides with the file.
- A screenshot of the Figma docs section matches the stories.
- Commit, then run the `resync-sites` skill: the Storybooks change, and the
  demo too if a screen uses the component.
