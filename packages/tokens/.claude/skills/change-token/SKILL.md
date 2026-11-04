---
name: change-token
description: Change a Rove design token, text style or shadow end to end - in the Rove Design System Figma file, exported into rove-tokens, checked, released to npm, and taken up by Rove. Use for any change to a colour, spacing, radius, type, opacity, motion or shadow value, or a token's name or description.
---

# Change a token

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

- Change the variable, text style or `Shadow/*` effect style. A new Palette
  shade follows `docs/rationale.md` (its name, its contrast target) and gets a
  description, like every token.
- Update every page that shows it: the Foundations pages' swatches, hex and
  alias labels, and any fill hard-coded to the old value. Search all pages for
  the old hex and name.

## 2. Into this repo

- `npm run figma:export` prints a script; run it through `use_figma`, save the
  result as JSON, and `npm run figma:save <result.json>`. Never hand-edit
  `src/figma/`.
- `npm run build`, then `npm run check`. Contrast failing means the shade
  misses WCAG AA: fix it in Figma, not here. `design-md` fails until the
  rebuilt `DESIGN.md` is committed, so commit, then check again.
- `npm run figma:check` prints the check script; run it through `use_figma`.
  It must return `inSync: true`.
- Commit only your paths: `git commit -m "…" -- <paths>`.

## 3. Release

- On the Figma cover, set Version to the new version and Updated to today.
- `npm version minor` (patch for a fix, major for a removal or rename), then
  `git push --follow-tags`. The tag's workflows build, check and publish to
  npm; `gh run list` shows them.

## 4. In Rove

- In `../rove`, once npm serves it: `npm install @swiftsolve/rove-tokens@<version>`,
  then `npm run check`, and commit `package.json` and `package-lock.json`.
- A token Rove's code names (a new one, or a rename) needs its uses and
  `src/styles/tailwind.css`'s theme updated in the same commit.
- Then run Rove's `resync-sites` skill (`../rove/.claude/skills/resync-sites/`).

## Done

- `figma:check` reported `inSync: true`, and every Figma page showing the token
  matches.
- `npm run check` passes here and in Rove.
- The summary says both sides changed and how that was checked.
