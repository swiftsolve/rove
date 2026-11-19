# Rove

A React app (`apps/rove/src`), its component library (`packages/ui`, imported
as `@swiftsolve/rove-ui`) and a Rust backend (`crates/rove-core`, behind a thin
Tauri shell in `apps/rove/src-tauri/`) over a typed bridge. The two pnpm
workspaces share the root's scripts, and turbo runs their typecheck, tests and
build. Claude Code loads the UI's guides with the first file it reads in their
folder, through `apps/rove/src/AGENTS.md` and `packages/ui/AGENTS.md`. Before
then, or in another agent, open them from the UI row below.

## What to read

Read the rows your task matches:

| Task | Read |
| --- | --- |
| Any | `README.md`: How it works, Development; `docs/architecture.md`: Where everything lives |
| UI | `apps/rove/src/README.md` and DESIGN.md; for the library, also `packages/ui/README.md` |
| Which library component, and its props | `pnpm rove-ui --md list`, then `pnpm rove-ui --md show <Name>`: one component from `packages/ui/catalog/components.gen.json`, generated from the code (`apps/rove/src/README.md`: Components) |
| The UI↔backend boundary, commands, events | `docs/architecture.md` |
| A backend service | `docs/what-rove-measures.md`, `docs/networking/data-capture.md` |
| Device discovery | `docs/networking/device-discovery.md`, `docs/networking/protocols.md` |
| Anything that sends data off the machine, or bundled data | `README.md`: Security model, Bundled data |
| A diagram in `docs/` | `docs/assets/README.md`: the style, and `pnpm diagrams`, which draws them |

## Procedures

Each is a skill: Claude Code loads its steps when the task comes up. Other
agents, open the file.

| Task | Skill |
| --- | --- |
| Add a screen, tab or subpage | `.claude/skills/add-screen/SKILL.md` |
| Show new backend data, from `rove-core` to a hook | `.claude/skills/add-backend-data/SKILL.md` |
| Add or change a token, text style or shadow | `../rove-tokens/.claude/skills/update-tokens/SKILL.md` |
| Add a library component, or change one's API or look | `.claude/skills/add-library-component/SKILL.md` |
| Write where a library component differs from its Figma component, and why, in `packages/ui/catalog/figma-differences.json` | `.claude/skills/write-figma-differences/SKILL.md` |
| Resync the sites and Storybooks after a change a user would see | `.claude/skills/resync-sites/SKILL.md` |
| Sweep `apps/rove/src`, `packages/ui` and `scripts/` for code that isn't plain | `.claude/skills/readability-sweep/SKILL.md` |

## Rules

### Keep Figma and code in sync

A design change (a token, text style, component variant or prop, copy,
spacing) lands on both sides in the same task: the Rove Design System file in
Figma, `rove-tokens`, this code, and the docs that describe it.

- **A token, text style or shadow** starts in Figma and flows one way, through
  `../rove-tokens` and a release, to here as `@swiftsolve/rove-tokens`.
- **A component** starts here, in `packages/ui/`, and its Figma component follows.

### Write plain code

Write the version a newcomer reads in one pass: named steps over dense
expressions, the codebase's existing pattern over a new one. Something clever
earns its place only when the plain version is wrong or too slow, and its
comment says which. A nested ternary is out: a third case is an `if` or a
lookup. [✓ CHECKED by `eslint.config.js`]

A block written out for three or more fields that differ only in data becomes
a table the code loops over, so a new field is one row: `CAPABILITY_MEASURES`
builds every row of a capability's details card. Two cases stay written out,
and so do field-by-field copies a language can't loop over (a Rust struct's
fields).

Every name (a variable, function, prop, type or file) says what it is in the
reader's words, however long that makes it: `meterWidth`, not `span`;
`itemSelector`, not `items`. A short name suits only a scope seen at a
glance, like `i` in a loop or `x` and `y` in geometry.

A function is named for its effect:

- one that acts (fetches, writes, focuses, schedules) is a verb phrase:
  `fetchFigmaJson`, `wakeAudioContext`, `flashHighlight`;
- one that only computes a value is named for the value: `testStatusText`,
  `restyleReason`, not `restyles`. A conversion keeps its verb,
  `formatSpeedMbps`, `parseServiceInput`. `get` reads outside state (a store,
  storage, the backend), `getSetting`, or leaves the value's name free for the
  variable that holds it, `getLinkCapacityMbps`;
- one that answers yes or no reads as a question: `isSameText`, `hasGradient`;
- an event handler is `onX`, as a prop and as a local: `onKeyDown`.
  [✓ CHECKED by `eslint.config.js`, for `handleX`]

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
| Anything | `pnpm check`: typecheck, lint, `scripts/checks/`, the `scripts/gen/` freshness checks, and every Vitest test, the stories with their play functions and axe |
| A library component, while you work | `pnpm --filter @swiftsolve/rove-ui test --project=storybook --project=dom src/<folder>`: its stories and DOM tests, in seconds |
| Rust | `cargo test -p rove-core`, `cargo clippy --workspace --all-targets -- -D warnings` and `cargo fmt --all` |
| How the UI looks | `pnpm screenshots --stable --out <dir>`, then again with `--theme light` into another, and read the PNGs: a wrong shade or a cramped gap shows only there. Library stories are in `25-library/`. `docs/screenshots` is committed, so point `--out` at a scratch folder |
| A refactor meant to look the same | The same shots before and after the change; `diff -rq <before> <after>` lists every one that moved, as `--stable` gives identical pixels run to run |
| A screen, subpage or dialog | `pnpm a11y`: axe on each, in both themes |
| A token | `rove-tokens`' `npm run check`, and `figma:check` reporting `inSync: true` (the `update-tokens` skill) |

### Done means

- The checks for your change pass.
- The guides' judgment rules, those without a ✓ CHECKED tag, are reviewed;
  `apps/rove/src/README.md`'s What review catches names the ones that slip most.
- A design change is on both sides, and the summary says how that was checked:
  the sync check's `inSync: true`, or an audit you name.
- A change a user would see (anything under `apps/rove/src` or `packages/ui`
  that renders, or a
  `@swiftsolve/rove-tokens` bump) is committed and resynced: the
  `resync-sites` skill.
