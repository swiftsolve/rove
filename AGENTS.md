# Rove

Read `README.md` first: it covers the architecture, frontend conventions and
development commands. The Figma design system is the source of truth for tokens
and components; they arrive through `@swiftsolve/rove-design`.

## Before committing

```bash
npm run check                # typecheck + lint (incl. CSS module check)
cargo check -p rove-core     # when Rust changed
```

## Keep the sites in sync after a UI change

Two sites embed a static build of this UI, and they don't update on their own.
After any change a user would see (anything under `src/` that renders, or a
`@swiftsolve/rove-design` bump), commit here, then resync both, in this order:

1. `../rove.swiftsolve.net`: `npm run sync-demo`, then commit `public/app/`
   as `chore(demo): resync the embedded app for <change>`.
2. `../nabilr.com`: `npm run import:rove` (it imports from
   rove.swiftsolve.net, so step 1 comes first), then commit as
   `Resync /rove for <change>`.

Backend-only, test or tooling changes don't need a resync.
