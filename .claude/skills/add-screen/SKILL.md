---
name: add-screen
description: Add a screen, tab or subpage to Rove's UI in apps/rove/src/features, with its navigation entry and its empty, loading and failed states. Use when a feature needs a new page in the app.
---

# Add a screen or tab

The rules a screen follows (where code goes, names and copy, styles) are in
`apps/rove/src/README.md`, which loads with any file under `apps/rove/src/`. These are the steps.

## Steps

1. **The view** in its feature's folder, rendering with no props: it reads
   context and its data hooks. Every page but Home starts with a `PageHeader`.
   New data comes first: the `add-backend-data` skill.
2. **Navigation**: a new tab is its id in `APP_TABS` (`apps/rove/src/app/utils/tabs.ts`)
   plus its entry in `TABS` (`apps/rove/src/app/utils/tab-registry.ts`): label, icon,
   `Screen`. A subpage is the tab's `subScreen`. Focus and scroll on
   navigating need no code.
3. **Copy** follows `apps/rove/src/README.md`'s Names and copy. The empty, loading and
   failed states use the library's `EmptyState`, `LoadingState` and `Banner`.
4. **Markup** from the library (`pnpm rove-ui --md list`, then `pnpm rove-ui --md show <Name>`). Markup no
   component covers is a new one: the `add-library-component` skill.

## Done

- `pnpm check` and `pnpm a11y` pass. The audit visits only the places
  in `SCENARIOS` (`scripts/a11y-audit.ts`): it fails on a tab with none, but
  a new subpage, dialog or menu gets its line there by hand.
- `pnpm dev` in both themes, and `pnpm screenshots --stable --out
  <dir>` (and `--theme light`): read the PNGs for the new screen.
- Commit, then the `resync-sites` skill: a new screen is a change a user would
  see.
