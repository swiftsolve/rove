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
| Add a library component, or change one's API or look | `.claude/skills/add-library-component/SKILL.md` |
| Resync the sites and Storybooks after a change a user would see | `.claude/skills/resync-sites/SKILL.md` |

## Check your work

What runs on its own, and when. Each stage catches only what it runs, so
don't leave your change to a later one: run what it needs (the second table)
before you commit. Never skip a hook with `--no-verify`; fix what it reports.

| Stage | Runs |
| --- | --- |
| Each edit (Claude Code, `.claude/settings.json`) | Prettier and ESLint on the file. Refuses `--no-verify`, a force push, `git reset --hard`, and a hand edit to a `*.gen.*` file (run `npm run catalogue`) |
| Each commit (`scripts/hooks/git/`, on after `npm install`) | ESLint and Prettier on the staged files; Rust fmt and tests when Rust is staged. `commit-msg` refuses an agent attribution line |
| Each push and pull request (CI) | `npm run check` (`test.yml`), its API-version check against the push's base; Rust fmt, clippy, tests and the app build on three OSes (`build.yml`); Chromatic's visual snapshots |
| A rove-tokens release (its CI) | Build, lint, contrast, descriptions, DESIGN.md freshness and the Figma plugin test |

What you run, by change:

| Changed | Run |
| --- | --- |
| Anything | `npm run check`: typecheck, lint, `scripts/checks/`, the catalogue checks, and every Vitest test, the stories with their play functions and axe |
| Rust | `cargo test -p rove-core`, `cargo clippy --workspace --all-targets -- -D warnings` and `cargo fmt --all` |
| How the UI looks | `npm run screenshots -- --stable --out <dir>`, then again with `--theme light` into another, and read the PNGs: no check sees a wrong shade or a cramped gap. A component's stories are in `25-library/`. Keep `--out` off `docs/screenshots`, which is committed |
| A refactor meant to look the same | The same shots before and after the change; `diff -rq <before> <after>` lists every one that moved, as `--stable` gives identical pixels run to run |
| A screen, subpage or dialog | `npm run a11y`: axe on each, in both themes |
| A token | rove-tokens' `npm run check`, and `figma:check` reporting `inSync: true` (the `change-token` skill) |

## Done means

- The checks for your change pass (above).
- What no check covers is reviewed: `docs/develop/frontend.md`, What's
  enforced, lists it, and DESIGN.md's rules without *Checked* are judgment.
- A design change is on both sides, shown by the sync check's `inSync: true`
  or an audit you name.
- A change a user would see (anything under `src/` that renders, or a
  `@swiftsolve/rove-tokens` bump) is committed and the sites are resynced: the
  `resync-sites` skill. Backend, test and tooling changes need no resync.
