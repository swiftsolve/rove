# Rove

A React UI (`src/`) and a Rust backend (`crates/rove-core`, behind a thin Tauri
shell in `src-tauri/`) over a typed bridge. Read what the task needs, not
everything:

| Task | Read |
| --- | --- |
| Any | `README.md`: How it works, Layout, Development |
| UI | `docs/develop/frontend.md` (conventions, which component) and `node_modules/@swiftsolve/rove-tokens/DESIGN.md` (which token for what), which `src/AGENTS.md` imports; for the library, also `docs/develop/ui-library.md`, which `src/ui/AGENTS.md` imports. Claude Code loads each with the first file under its folder; other agents, read them first |
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
this code, and the docs that describe it (`docs/develop/frontend.md`,
`docs/develop/ui-library.md`).

- **A token, text style or shadow** starts in Figma and flows one way, through
  `../rove-tokens` and a release, to here.
- **A component** changes here first, then in Figma to match.

Say in the summary that both sides changed and how you checked (the sync
check's result, or an audit).

## Procedures

Each is a skill: Claude Code loads its steps when the task comes up. Other
agents, open the file.

| Task | Skill |
| --- | --- |
| Change a token, text style or shadow | `../rove-tokens/.claude/skills/change-token/SKILL.md` |
| Add a library component, or change one's API | `.claude/skills/add-library-component/SKILL.md` |
| Resync the sites and Storybooks after a change a user would see | `.claude/skills/resync-sites/SKILL.md` |

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

## Done means

- `npm run check` passes, and the Rust commands above when Rust changed.
- What no check covers is reviewed: `docs/develop/frontend.md`, What's
  enforced, lists it, and DESIGN.md's rules without *Checked* are judgment.
  Look at a UI change in both themes.
- A design change is on both sides, shown by the sync check's `inSync: true`
  or an audit you name.
- A change a user would see (anything under `src/` that renders, or a
  `@swiftsolve/rove-tokens` bump) is committed and the sites are resynced: the
  `resync-sites` skill. Backend, test and tooling changes need no resync.
