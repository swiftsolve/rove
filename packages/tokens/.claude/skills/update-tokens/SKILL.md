---
name: update-tokens
description: Add or change a Rove design token, text style or shadow end to end - in the Rove Design System Figma file, exported into rove-tokens, checked, released to npm, and taken up by Rove. Use for a new token, or any change to a colour, spacing, radius, type, opacity, motion or shadow value, or a token's name or description.
---

# Update the tokens

Tokens flow one way: Figma, then this repo, then npm, then Rove. Nothing
writes back to Figma. README.md (Update the tokens, Release) has the human
version; this is the whole run.

## 1. In Figma

The file key is in `src/figma/variables.json`. What you need:

- **The Figma MCP server**, connected (in Claude Code, the claude.ai Figma
  connector). Its `use_figma` tool runs Figma Plugin API JavaScript inside the
  file: that's how an agent changes variables, exports them and runs the sync
  check. Call its `create_session` with the file key first, and pass the
  session id to every call after.
- **Figma's skills** `figma-use` (Plugin API rules; required before any
  `use_figma` call) and `figma-generate-library` (variables, aliases and
  scopes). They come with Figma's Claude Code plugin, as `figma:figma-use` and
  `figma:figma-generate-library`, and the MCP server also serves them
  (`skill://figma/figma-use/SKILL.md`) when the plugin isn't installed. Load
  both before the first `use_figma` call.

Without the server, a person makes the Figma change and exports with the
plugin in `figma-plugin/` (README.md: Update the tokens); continue from step 2.

**A new token** first has to earn its place: a value two or more places need,
that no existing token names. A one-off (a corner copied from the app icon, a
gap set by an icon's ink) stays a raw value in the code that uses it, with its
reason in Rove's `scripts/checks/raw-values.mjs` `ALLOWED` list. If it does
earn one, create it in Figma like its neighbours:

- In the collection its siblings are in, with a value for every mode (Dark
  and Light for a colour), aliased to a Palette or scale variable where its
  siblings are.
- Its scopes narrowed to where it applies, as its siblings' are, and its
  WEB code syntax set to its path as a CSS variable (`radius/xs` takes
  `var(--radius-xs)`). Without code syntax it stays out of `tokens.css`, and
  the build refuses one that doesn't match the path.
- A description saying what it's for, in the words its siblings use;
  `scripts/checks/descriptions.mjs` fails without one.

- Change the variable, text style or `Shadow/*` effect style. A new Palette
  shade follows `docs/rationale.md` (its name, its contrast target) and gets a
  description, like every token.
- Update every page that shows it: the Foundations pages' swatches, hex and
  alias labels, and any fill hard-coded to the old value. Search all pages for
  the old hex and name. A new token gets its own swatch or row on its
  Foundations page, next to its siblings.

## 2. Into this repo

- `npm run figma:export` prints a script; run it through `use_figma`, save the
  result as JSON, and `npm run figma:save <result.json>`. Never hand-edit
  `src/figma/`.
- `npm run build`, then `npm run check`. Contrast failing means the shade
  misses WCAG AA: fix it in Figma, not here. `design-md-fresh` fails until the
  rebuilt `DESIGN.md` is committed, so commit, then check again.
- `npm run figma:check` prints the check script; run it through `use_figma`.
  It must return `inSync: true`.
- Commit only your paths: `git commit -m "…" -- <paths>`.

- A new token: if DESIGN.md's hand-written top half says which token to use
  for what in its area, add it there too.

## 3. Release

Releases are batched: stop once the change is on `main` and say it's
unreleased, unless Rove needs it now or the user asks for a release.

- On the Figma cover, set Version to the new version and Updated to today.
- Pick the bump by what Rove sees: patch when no CSS variable is added,
  removed or renamed; minor for a new token; major for a rename or removal.
  Say which and why, then `npm version <bump>` and
  `git push --follow-tags`. The tag's workflows build, check and publish to
  npm; `gh run list` shows them.

## 4. In Rove

- In `../rove`, once npm serves it: `npm install @swiftsolve/rove-tokens@<version>`,
  then `npm run gen` and `npm run check`, and commit `package.json`,
  `package-lock.json` and any `*.gen.*` file that changed.
- A token Rove's code names (a new one, or a rename) needs its uses and
  `src/styles/tailwind.css`'s theme updated in the same commit, then
  `npm run gen` again: `cn` reads its names from the theme.
- Then run Rove's `resync-sites` skill (`../rove/.claude/skills/resync-sites/`).

## Done

- `figma:check` reported `inSync: true`, and every Figma page showing the token
  matches.
- `npm run check` passes here and in Rove.
- The summary says both sides changed and how that was checked.
