---
name: resync-sites
description: Resync the two sites that embed Rove's UI (rove.swiftsolve.net and nabilr.com) and the hosted Storybooks. Use after committing a Rove change a user would see (anything under src/ that renders, or a @swiftsolve/rove-tokens bump); not for backend-only, test or tooling changes.
---

# Resync the sites

rove.swiftsolve.net and nabilr.com embed a static build of Rove's UI, and the
first also hosts both Storybooks. None of them update on their own.

## Which steps

| Change | Demo and nabilr.com | Storybooks |
| --- | --- | --- |
| Anything under `src/` that renders | yes | if under `src/ui` |
| A `@swiftsolve/rove-tokens` bump | yes | yes |
| Only stories or library docs pages | no | yes |
| Backend, tests, tooling, docs | no | no |

## Steps

Commit in Rove first. The demo builds from this checkout; the Storybooks build
from `origin/master` and rove-tokens' `origin/main`, so push before step 3.

1. **Demo**, in `../rove.swiftsolve.net`: `npm run sync-demo`, then commit
   `public/app/` as `chore(demo): resync the embedded app for <change>`.
2. **nabilr.com**, in `../nabilr.com`: `npm run import:rove`, which imports
   from rove.swiftsolve.net, so step 1 comes first. Commit `public/rove-app/`
   as `Resync /rove for <change>`.
3. **Storybooks**, in `../rove.swiftsolve.net`: `npm run sync-storybook`, then
   commit `public/storybook/` as `chore(storybook): resync for <change>`.

Commit only those paths: other sessions share these checkouts. Stage the
folder first, `git add -A <folder>`, then `git commit -m "…" -- <folder>`:
every build gives its files new names, and `git commit -- <folder>` alone
takes only files git already tracks, so it commits the old files' deletion
without the new ones and the site loads a script that isn't there. The synced
folders are build output, and Claude Code's settings refuse a hand edit there.

## Done

- Each site's commit holds only its synced folder.
- `git status --short <folder>` is empty after the commit: no new file was left
  out.
- The new build is in it: the demo's asset hash changed, or a changed value
  (a token's hex, a story) shows up in the built files.
- Pushing a site deploys it, so ask before pushing either one, and say in the
  summary which are committed but not pushed.
