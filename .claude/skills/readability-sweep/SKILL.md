---
name: readability-sweep
description: Sweep src/ and scripts/ for code a newcomer stumbles on (AGENTS.md: Write plain code), with screenshots proving nothing moved.
disable-model-invocation: true
---

# Readability sweep

A pass over the whole frontend and its scripts against AGENTS.md's "Write
plain code" and src/README.md's "What review catches". The bar is a
_newcomer_ reading each file once: they meet only plain names, named steps,
comments that say why, and a why beside anything clever. Pixels and behaviour
stay identical.

## Steps

1. **Baseline from HEAD.** Other sessions edit this checkout, so shoot the
   "before" set from a clean copy, never the working tree:
   `git archive HEAD | tar -x -C <scratch>/head`, symlink `node_modules` into
   it, then from there run `node scripts/screenshots.ts --stable --out
   <scratch>/before-dark` and again with `--theme light`. Done when both
   folders hold the full set (113 shots each as of 2026-11).
2. **Review by folder.** Split into disjoint groups (`src/ui`;
   `src/app` + `src/bridge`; `src/features/*` in two halves; `src/utils`,
   `src/hooks`, `src/types`, `scripts/`) and give each to a subagent with one
   shared brief: the bar above, the house rules (boolean prefixes, comment
   length, no em dash in copy), edit only, never stage or commit, rename
   callers repo-wide, regenerate `components.gen.json` with
   `node scripts/gen/components.ts` instead of editing it, and report each
   file changed with what got plainer. A reviewer that changes a check script
   proves it reports the same problems on files that break the rule on
   purpose. Done when every folder is reported, as changed or already plain.
3. **Read every diff yourself.** Keep a change only when a newcomer would
   stumble on the old version and every input gives the same output (watch
   `??` against `||`, empty strings, null against undefined). Revert anything
   a reviewer could call a matter of taste, and move a comment that drifted
   off the line it describes. Done when each remaining hunk passes both tests.
4. **Check.** `npm run check`, with no screenshot run going at the same time:
   both start Vite servers, and Vitest fails on the port clash even with
   every test green.
5. **Commit by folder**, by path (AGENTS.md: Commit only your paths), as
   `refactor(<folder>): …` naming what got plainer. A rename's callers ride
   in the commit of the folder that owns the renamed thing.
6. **Prove nothing moved.** Shoot the "after" set from the checkout in both
   themes, then `diff -rq` each against its "before" folder. Done when both
   diffs print nothing. If a shot differs, shoot the HEAD copy again: a shot
   that also differs from its own first run is timing, not your change, and
   "after" matching that rerun clears it. A pixel-identical sweep is no change a user would
   see, so it needs no `resync-sites`.

Report each folder with what got plainer, or "already plain".
