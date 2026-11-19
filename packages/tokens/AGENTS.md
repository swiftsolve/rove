# Rove Tokens

`@swiftsolve/rove-tokens`: Rove's design tokens, a workspace of the Rove
monorepo that the library imports from its build and npm serves to other
sites. Run its scripts from the repo root as `pnpm tokens <script>`. The
root `AGENTS.md`'s rules hold here too. The Figma plugin in
`figma-plugin/` exports the Rove Design System's variables, text styles and
shadows into `src/figma/`, and `build` turns them into `dist/`
(`tokens/` in DTCG, `tokens.css`, `text-styles.css`, `tailwind-theme.css`) and
`DESIGN.md`'s front matter, every token with its value and use.

## What to read

| Task | Read |
| --- | --- |
| Which token to use for what, and every value | `DESIGN.md` |
| How the package's files name and hold the tokens | `docs/using-the-tokens.md` |
| Why a value is what it is | `docs/rationale.md`, `docs/adr/` |
| How the export, build and checks work | `README.md`: How it works |
| Where each file is, and every script | `CONTRIBUTING.md`: What's where, Scripts |
| Updating and releasing, step by step | `CONTRIBUTING.md`: Update the tokens, Release |

## Procedures

| Task | Skill |
| --- | --- |
| Add or change a token, text style or shadow, use it in Rove, and release it | Rove's `.claude/skills/update-tokens/SKILL.md` |

## Rules

### Figma is the source of truth; git is the record

Tokens flow one way: designed in Figma, exported into this package, built,
and used by Rove in the same commit. Nothing here writes to Figma.

- **Change a token in Figma, then export and build.** The export writes
  `src/figma/*.json` and the build writes `dist/` and `DESIGN.md`'s front
  matter, so the next run undoes an edit there; the prose
  in `DESIGN.md` below the front matter is edited directly. Only what Figma can't hold (font
  stacks, easing curves, the focus expressions) is written here, in
  `src/code-tokens.json`.
- **`pnpm tokens figma:check` reports `inSync: true`.**
  - It and `figma:export` print the plugin's own code
    (`figma-plugin/code.js`) to run through the Figma MCP's `use_figma`, so
    the plugin's Check tab and an agent check the same way.
  - A difference means the repo is behind Figma (export again) or was edited
    directly (undo it, and change Figma).

## Validation

Run the root's `pnpm check` before you commit: it builds the tokens (the
build refuses a token without a description), typechecks the scripts (`tsc`,
as Node runs the `.ts` files without checking types), runs the Figma plugin's
test and the WCAG AA contrast and DESIGN.md format checks, lints this folder
with its own `eslint.config.js` and `.prettierrc.json`, and then checks Rove
against the new build. Commit the rebuilt `DESIGN.md` with the change.
