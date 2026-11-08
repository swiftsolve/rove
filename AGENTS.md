# Rove

A React UI (`src/`) and a Rust backend (`crates/rove-core`, behind a thin Tauri
shell in `src-tauri/`) over a typed bridge. Claude Code loads the UI's guides
with the first file it reads in their folder, through `src/AGENTS.md` and
`src/ui/AGENTS.md`. Before then, or in another agent, open them from the UI
row below.

## What to read

Read the rows your task matches:

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
| Sweep `src/` and `scripts/` for code that isn't plain | `.claude/skills/readability-sweep/SKILL.md` |

## Rules

### Keep Figma and code in sync

A design change (a token, text style, component variant or prop, copy,
spacing) lands on both sides in the same task: the Rove Design System file in
Figma, `rove-tokens`, this code, and the docs that describe it.

- **A token, text style or shadow** starts in Figma and flows one way, through
  `../rove-tokens` and a release, to here as `@swiftsolve/rove-tokens`.
- **A component** starts here, in `src/ui`, and its Figma component follows.

### Write plain code

Write the version a newcomer reads in one pass: named steps over dense
expressions, the codebase's existing pattern over a new one. Something clever
earns its place only when the plain version is wrong or too slow, and its
comment says which.

### Commit only your paths

Other sessions work in this checkout and commit to `master` alongside you.
Stage and commit your own files by name, `git add -A <paths>` then
`git commit -m "…" -- <paths>`, and leave everyone else's changes where they
are.

## Validation

### Check your work

Run what your change needs before you commit: the hooks and CI run only part
of it (README.md: Check a change lists each stage). Fix what a hook reports.

| Changed | Run |
| --- | --- |
| Anything | `npm run check`: typecheck, lint, `scripts/checks/`, the `scripts/gen/` freshness checks, and every Vitest test, the stories with their play functions and axe |
| A library component, while you work | `npx vitest run --project=storybook --project=dom src/ui/<folder>`: its stories and DOM tests, in seconds |
| Rust | `cargo test -p rove-core`, `cargo clippy --workspace --all-targets -- -D warnings` and `cargo fmt --all` |
| How the UI looks | `npm run screenshots -- --stable --out <dir>`, then again with `--theme light` into another, and read the PNGs: a wrong shade or a cramped gap shows only there. Library stories are in `25-library/`. `docs/screenshots` is committed, so point `--out` at a scratch folder |
| A refactor meant to look the same | The same shots before and after the change; `diff -rq <before> <after>` lists every one that moved, as `--stable` gives identical pixels run to run |
| A screen, subpage or dialog | `npm run a11y`: axe on each, in both themes |
| A token | `rove-tokens`' `npm run check`, and `figma:check` reporting `inSync: true` (the `update-tokens` skill) |

### Done means

- The checks for your change pass.
- The guides' judgment rules, those without a ✓ CHECKED tag, are reviewed;
  `src/README.md`'s What review catches names the ones that slip most.
- A design change is on both sides, and the summary says how that was checked:
  the sync check's `inSync: true`, or an audit you name.
- A change a user would see (anything under `src/` that renders, or a
  `@swiftsolve/rove-tokens` bump) is committed and resynced: the
  `resync-sites` skill.
