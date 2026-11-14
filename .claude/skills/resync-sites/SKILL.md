---
name: resync-sites
description: Resync nabilr.com/rove, which embeds Rove's UI as a live demo and hosts both Storybooks. Use after committing a Rove change a user would see (anything under src/ that renders, or a @swiftsolve/rove-tokens bump); not for backend-only, test or tooling changes.
---

# Resync the site

nabilr.com/rove (in `../nabilr.com`) is Rove's landing page. It embeds a static
build of Rove's UI as a live demo, on /rove and /rove/design, and hosts both
Storybooks under /rove/storybook/. None of them update on their own.
rove.swiftsolve.net only redirects there, so it never needs a resync.

## Which steps

| Change | Demo | Storybooks |
| --- | --- | --- |
| Anything under `src/` that renders | yes | if under `src/ui` |
| A `@swiftsolve/rove-tokens` bump | yes | yes |
| Only stories or library docs pages | no | yes |
| Backend, tests, tooling, docs | no | no |

## Steps

Commit in Rove first. The demo builds from this checkout; the Storybooks build
from `origin/master` and rove-tokens' `origin/main`, so push before step 2.

1. **Demo**, in `../nabilr.com`: `npm run sync:rove-demo`, then commit
   `public/rove-app/` as `Resync /rove for <change>`.
2. **Storybooks**, in `../nabilr.com`: `npm run sync:rove-storybook`, then
   commit `public/rove/storybook/` as `chore(rove): resync the Storybooks for
   <change>`.

Commit only those paths: other sessions share this checkout. Stage the folder
first, `git add -A <folder>`, then `git commit -m "…" -- <folder>`: every
build gives its files new names, and `git commit -- <folder>` alone takes only
files git already tracks, so it commits the old files' deletion without the
new ones and the site loads a script that isn't there. The synced folders are
build output, so change them only through the sync scripts.

## Done

- Each commit holds only its synced folder.
- `git status --short <folder>` is empty after the commit: no new file was left
  out.
- The new build is in it: the demo's asset hash changed, or a changed value
  (a token's hex, a story) shows up in the built files.
- Pushing nabilr.com deploys it, so ask before pushing, and say in the summary
  what is committed but not pushed.
