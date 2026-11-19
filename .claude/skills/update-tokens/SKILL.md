---
name: update-tokens
description: Add or change a Rove design token, text style or shadow end to end - in the Rove Design System Figma file, exported into packages/tokens, checked, used by the app, and released to npm. Use for a new token, or any change to a colour, spacing, radius, type, opacity, motion or shadow value, or a token's name or description.
---

# Update the tokens

Tokens flow one way: Figma, then `packages/tokens`, then the library and the
app, and npm for the sites that install them. Nothing writes back to Figma.
`packages/tokens/CONTRIBUTING.md` (Update the tokens, Release) has the human
version; this is the whole run.

## 1. In Figma

The file key is in `packages/tokens/src/figma/variables.json`. What you need:

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
plugin in `packages/tokens/figma-plugin/` (CONTRIBUTING.md: Update the tokens); continue from step 2.

**A new token** first has to earn its place: a value two or more places need,
that no existing token names. A one-off (a corner copied from the app icon, a
gap set by an icon's ink) stays a raw value in the code that uses it, with its
reason in the `ALLOWED` list in `scripts/checks/raw-values.ts`. If it does
earn one, create it in Figma like its neighbours:

- In the collection its siblings are in, with a value for every mode (Dark
  and Light for a colour), aliased to a Palette or scale variable where its
  siblings are.
- Its scopes narrowed to where it applies, as its siblings' are, and its
  WEB code syntax set to its path as a CSS variable (`radius/xs` takes
  `var(--radius-xs)`). Without code syntax it stays out of `tokens.css`, and
  the build refuses one that doesn't match the path.
- A description saying what it's for, in the words its siblings use; the
  build refuses a token without one.

- Change the variable, text style or `Shadow/*` effect style. A new Palette
  shade follows `packages/tokens/docs/rationale.md` (its name, its contrast target) and gets a
  description, like every token.
- Update every page that shows it: the Foundations pages' swatches, hex and
  alias labels, and any fill hard-coded to the old value. Search all pages for
  the old hex and name. A new token gets its own swatch or row on its
  Foundations page, next to its siblings.

## 2. Into packages/tokens

Run these from the repo root: `pnpm tokens <script>` runs one of the tokens'
own scripts.

- `pnpm tokens figma:export` prints a script; run it through `use_figma`,
  save the result as JSON, and `pnpm tokens figma:save <result.json>`, with
  an absolute path: the script runs in `packages/tokens`.
  Never edit `packages/tokens/src/figma/` directly.
- `pnpm tokens figma:check` prints the check script; run it through
  `use_figma`. It must return `inSync: true`.
- A new token: if `packages/tokens/DESIGN.md` (edited directly below its front
  matter) says which token to use for what in its area, add it there too. Its
  front matter lists it on its own.

## 3. In the code that uses it

The library imports the tokens from their build, so a change reaches the app
with no release.

- `pnpm gen` rereads the Tailwind theme for `cn`. A new token's utility exists
  once the tokens are built; a rename needs every use updated in the same
  commit.
- `pnpm check` builds the tokens first, then runs their checks (contrast
  failing means the shade misses WCAG AA: fix it in Figma, not here) and the
  app's and library's. Commit the rebuilt `packages/tokens/DESIGN.md` with
  the change.
- Commit the tokens and the code that uses them together, only your paths:
  `git add -A <paths>`, then `git commit -m "…" -- <paths>`.
- Then run the `resync-sites` skill: the demo and both Storybooks.

## 4. Release to npm

nabilr.com and rove.swiftsolve.net install `@swiftsolve/rove-tokens` from npm;
Rove itself doesn't. Releases are batched: stop once the change is on
`master` and say it's unreleased, unless one of those sites needs it or the
user asks for a release.

- On the Figma cover, set Version to the new version and Updated to today.
- Pick the bump by what a site sees: patch when no CSS variable is added,
  removed or renamed; minor for a new token; major for a rename or removal.
  Say which and why, then `pnpm tokens release <bump>`, which commits
  `packages/tokens/package.json` and tags `tokens-v<version>`, and
  `git push origin master tokens-v<version>`. The tag's workflow,
  `publish-tokens.yml`, checks, then publishes to npm; `gh run list` shows it.

## Done

- `figma:check` reported `inSync: true`, and every Figma page showing the token
  matches.
- `pnpm check` passes.
- The summary says both sides changed and how that was checked.
