# Rove

A React UI (`src/`) and a Rust backend (`crates/rove-core`, behind a thin Tauri
shell in `src-tauri/`) over a typed bridge. Read what the task needs, not
everything:

| Task | Read |
| --- | --- |
| Any | `README.md`: How it works, Layout, Development |
| UI | `docs/develop/frontend.md` (conventions, component table) and `node_modules/@swiftsolve/rove-tokens/DESIGN.md` (which token for what; `src/AGENTS.md` imports it, so Claude Code loads it with the first file under `src/`) |
| The UI↔backend boundary, commands, events | `docs/develop/architecture.md` |
| A backend service | `README.md`: What each feature actually measures, Platform support; `docs/networking/data-capture.md` |
| Device discovery | `docs/networking/device-discovery.md`, `docs/networking/protocols.md` |
| Anything that sends data off the machine, or bundled data | `README.md`: Security model, Bundled data |

Tokens are designed in the Rove Design System in Figma and released from
`../rove-tokens`; they arrive through `@swiftsolve/rove-tokens`. Components
start here, in `src/ui`, and the Figma components mirror them.

`src/ui/components.gen.json` lists every library component with its group,
props, variant values, Figma component, stories and usage guide (when to use
it, when not, accessibility), generated from the code. Read it before
`src/ui`'s files when you need the library's API or which component to pick.

## Keep Figma and code in sync

A design change (a token, text style, component variant or prop, copy,
spacing) lands on both sides in the same task: the Figma file, `rove-tokens`,
this code, and `docs/develop/frontend.md`.

- **A token, text style or shadow** starts in Figma: change it there (the
  Figma MCP's `use_figma` can), then export it into `../rove-tokens` and
  release; `../rove-tokens/AGENTS.md` has the steps. Nothing writes back to
  Figma. `npm run figma -- check` there must then report `inSync: true`.
- **A component** changes here first, then in Figma to match.
- **Every Figma page that shows a changed token** is updated too: labels,
  swatches and hard-coded fills.

Say in the summary that both sides changed and how you checked (the sync
check's result, or an audit).

## Check your work

```bash
npm run check                # typecheck, lint, the repo's checks, and every Vitest test
cargo test -p rove-core      # when Rust changed
cargo clippy --workspace --all-targets -- -D warnings   # likewise
cargo fmt --all              # likewise (rustfmt.toml)
```

Lint enforces the house rules (boolean prefixes, no em dash in copy,
library imports, raw values); each check in `scripts/checks/` says what
it guards. Hooks run some of it for you:

- **Git** (`scripts/hooks/git/`, on after `npm install`): `pre-commit` lints
  and format-checks the staged files, and runs the Rust tests when Rust is
  staged. `commit-msg` refuses an agent attribution line. Don't skip them
  with `--no-verify`; fix what they report.
- **Claude Code** (`.claude/settings.json`): every edited file is formatted and
  linted on the spot; `--no-verify`, a force push and `git reset --hard` are
  refused; generated `*.gen.*` files can't be hand-edited (run
  `npm run catalogue`).

## Keep the sites in sync after a UI change

Two sites embed a static build of this UI, and they don't update on their own.
After any change a user would see (anything under `src/` that renders, or a
`@swiftsolve/rove-tokens` bump), commit here, then resync both, in this order:

1. `../rove.swiftsolve.net`: `npm run sync-demo`, then commit `public/app/`
   as `chore(demo): resync the embedded app for <change>`.
2. `../nabilr.com`: `npm run import:rove` (it imports from
   rove.swiftsolve.net, so step 1 comes first), then commit as
   `Resync /rove for <change>`.

Once a change under `src/ui` (or a `@swiftsolve/rove-tokens` release) is on
master, also run `npm run sync-storybook` in `../rove.swiftsolve.net` and commit
`public/storybook/` as `chore(storybook): resync for <change>`. It builds the
hosted Storybooks from `origin/master` and rove-tokens' `origin/main`, not from
this checkout.

Backend-only, test or tooling changes don't need a resync.
