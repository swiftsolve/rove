# Rove

A React UI (`src/`) and a Rust backend (`crates/rove-core`, behind a thin Tauri
shell in `src-tauri/`) over a typed bridge. This file is the map, the
procedures, the rules for every change and how it's validated. The UI's own
rules load with its folders: `src/AGENTS.md` imports `src/README.md` and
rove-tokens' `DESIGN.md`, and `src/ui/AGENTS.md` imports `src/ui/README.md`.
Other agents, read the ones your change touches first. In those guides,
**[✓ CHECKED by `file`]** marks a rule a check enforces and names the check's file,
so `npm run check` fails when it's broken; a rule without it is judgment.

## What to read

Read what the task needs, not everything:

| Task | Read |
| --- | --- |
| Any | `README.md`: How it works, Development; `docs/architecture.md`: Where everything lives |
| UI | `src/README.md` and DESIGN.md; for the library, also `src/ui/README.md` |
| Which library component, and its props | `src/ui/components.gen.json`, generated from the code (`src/README.md`: Components) |
| The UI↔backend boundary, commands, events | `docs/architecture.md` |
| A backend service | `docs/what-rove-measures.md`, `docs/networking/data-capture.md` |
| Device discovery | `docs/networking/device-discovery.md`, `docs/networking/protocols.md` |
| Anything that sends data off the machine, or bundled data | `README.md`: Security model, Bundled data |

## Procedures

Each is a skill: Claude Code loads its steps when the task comes up. Other
agents, open the file.

| Task | Skill |
| --- | --- |
| Add a screen, tab or subpage | `.claude/skills/add-screen/SKILL.md` |
| Show new backend data, from `rove-core` to a hook | `.claude/skills/add-backend-data/SKILL.md` |
| Add or change a token, text style or shadow | `../rove-tokens/.claude/skills/update-tokens/SKILL.md` |
| Add a library component, or change one's API or look | `.claude/skills/add-library-component/SKILL.md` |
| Map a library component to its Figma component, in `src/ui/figma-components.json` | `.claude/skills/map-figma-component/SKILL.md` |
| Resync the sites and Storybooks after a change a user would see | `.claude/skills/resync-sites/SKILL.md` |

## Rules

### Keep Figma and code in sync

A design change (a token, text style, component variant or prop, copy,
spacing) lands on both sides in the same task: the Rove Design System file in
Figma, `rove-tokens`, this code, and the docs that describe it.

- **A token, text style or shadow** starts in Figma and flows one way, through
  `../rove-tokens` and a release, to here as `@swiftsolve/rove-tokens`.
- **A component** starts here, in `src/ui`, and its Figma component follows.

## Validation

### Check your work

Each stage in [What runs on its own](#what-runs-on-its-own) catches only what
it runs, so don't leave your change to a later one: run what it needs before
you commit. Never skip a hook with `--no-verify`; fix what it reports.

| Changed | Run |
| --- | --- |
| Anything | `npm run check`: typecheck, lint, `scripts/checks/`, the `scripts/gen/` freshness checks, and every Vitest test, the stories with their play functions and axe |
| A library component, while you work | `npx vitest run --project=storybook --project=dom src/ui/<folder>`: its stories and DOM tests, in seconds |
| Rust | `cargo test -p rove-core`, `cargo clippy --workspace --all-targets -- -D warnings` and `cargo fmt --all` |
| How the UI looks | `npm run screenshots -- --stable --out <dir>`, then again with `--theme light` into another, and read the PNGs: no check sees a wrong shade or a cramped gap. Library stories are in `25-library/`. Keep `--out` off `docs/screenshots`, which is committed |
| A refactor meant to look the same | The same shots before and after the change; `diff -rq <before> <after>` lists every one that moved, as `--stable` gives identical pixels run to run |
| A screen, subpage or dialog | `npm run a11y`: axe on each, in both themes |
| A token | rove-tokens' `npm run check`, and `figma:check` reporting `inSync: true` (the `update-tokens` skill) |

### What runs on its own

| Stage | Runs |
| --- | --- |
| Each edit (Claude Code, `.claude/settings.json`) | Prettier and ESLint on the file. Refuses a hook skipped, a force push, `git reset --hard`, and a direct edit to a `*.gen.*` file (run `npm run gen`) |
| Each commit (`scripts/hooks/git/`, on after `npm install`) | ESLint and Prettier on the staged files; Rust fmt and tests when Rust is staged. `commit-msg` refuses an agent attribution line |
| Each push and pull request (CI) | `npm run check` (`test.yml`), its API-version check against the push's base; `rove-core`'s Rust fmt, clippy and tests on Linux (`test.yml`); Chromatic's visual snapshots |
| A Rove release tag, `v*` (CI) | Rust fmt, clippy, tests and the app build on three OSes (`build.yml`), beside the release bundles (`release.yml`); `build.yml` also runs on demand from Actions |
| A rove-tokens release (its CI) | Build, lint, contrast, descriptions, DESIGN.md freshness, and the Figma plugin test |

### Done means

- The checks for your change pass.
- What no check covers is reviewed: `src/README.md`'s What's enforced lists it,
  and DESIGN.md's rules without the tag are judgment.
- A design change is on both sides, and the summary says how that was checked:
  the sync check's `inSync: true`, or an audit you name.
- A change a user would see (anything under `src/` that renders, or a
  `@swiftsolve/rove-tokens` bump) is committed and the sites are resynced: the
  `resync-sites` skill. Backend, test and tooling changes need no resync.
