---
name: add-backend-data
description: Show new data from Rove's Rust backend in the UI, end to end - the logic in crates/rove-core, a Tauri command, the type, both bridges (Tauri and the dev mock) and a hook. Use when a screen needs data or an action the NetworkAPI doesn't offer yet.
---

# Show new backend data

Every command is the same six edits across the boundary.
`docs/architecture.md` explains the boundary; these are the steps.

## Before you start

- Read `apps/rove/src/types/api.ts` (`NetworkAPI`) for a method that already returns it,
  or one that needs only a field more.
- Anything that measures the network: README.md's What each feature actually
  measures and Platform support. Anything that sends data off the machine:
  README.md's Security model, first.

## Steps

1. **The logic** in `crates/rove-core/`: a plain function or method, with no
   Tauri in it, and a unit test beside it. A struct the UI reads derives
   `Serialize` with `#[serde(rename_all = "camelCase")]`.
2. **The command** in `apps/rove/src-tauri/src/commands.rs`: a thin `#[tauri::command]`
   that calls the core and returns its result.
3. **Register it** in `tauri::generate_handler![…]` in `apps/rove/src-tauri/src/lib.rs`
   (`commands::<name>`). A missing entry is the "command not found" error.
4. **The type** in `apps/rove/src/types/` (camelCase, as serde sends it), and the method
   on `NetworkAPI` in `apps/rove/src/types/api.ts`.
5. **Both bridges**: `apps/rove/src/bridge/tauri-network-api.ts` invokes the command;
   `apps/rove/src/bridge/mock-network-api.ts` answers with plausible data, so `npm run dev`
   keeps working in a browser. A value the backend can add to later (a kind,
   an event type) is narrowed in `apps/rove/src/bridge/narrow.ts`.
6. **The hook** in the feature's `hooks/`, on `useBackendQuery`, keyed by the
   data plus `useNetworkKey()` when it belongs to one network. A view reads
   it; to add the screen too, the `add-screen` skill.

## Done

- `cargo test -p rove-core`, `cargo clippy --workspace --all-targets -- -D
  warnings` and `cargo fmt --all` pass, and `npm run check` does.
- `npm run dev` shows it against the mock, and `npm run tauri:dev` against the
  real backend.
- A screen that renders it is a change a user would see: commit, then the
  `resync-sites` skill.
