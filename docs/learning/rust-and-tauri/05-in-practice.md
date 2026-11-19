# In practice: reading moves, and adding a command

Part 5 of [Learning Rust & Tauri through Rove](README.md).

Previous: [Async, tokio and traits](04-async-and-traits.md). Back to [Contents](README.md).

## 11. Ownership & borrowing: read the moves in real code

Section 5 gave the rules. Here are four snippets from the files above; try to
predict *why each is written the way it is* before reading the answer.

1. **`cancel.clone()`** in `run_speed_test` (`apps/rove/src-tauri/src/commands.rs`).
   `cancel` is an `Arc<AtomicBool>`. It's cloned because more than one owner
   needs it: the speed engine (`rove_core::speed::run`, which polls it to abort
   mid-stream) and the `running` slot in `AppState`'s `speed_runs` (so
   `cancel_speed_test` can flip it from another command).
   Cloning an `Arc` doesn't copy the bool; it bumps a reference count and hands
   back a second handle to the *same* flag. That's how two async tasks share one
   cancellation signal safely.

2. **`async move`** in every `spawn` (`spawn_usage_sampler` in
   `apps/rove/src-tauri/src/monitors.rs`, and the loops below it). Without
   `move`, the closure
   would *borrow* the `AppHandle` from the enclosing function, but the spawned
   task outlives that function, so the borrow would dangle. `move` transfers
   ownership into the task. The compiler *requires* it here; it won't let you spawn
   a task that borrows a local.

3. **`runs.running.take()`** in `cancel_speed_test`. `runs` is the
   `MutexGuard` over `SpeedRuns`, and `running` is an
   `Option<(String, Arc<AtomicBool>)>`: the running test's token and its cancel
   flag. `.take()` moves the value *out*, leaving `None` behind:

   ```rust
   match runs.running.take() {
       Some((token, cancel)) if token == run_token => cancel.store(true, Ordering::Relaxed),
       other => {
           // Not this run (it hasn't registered yet): put back whatever is
           // running, and stop this one when it arrives.
           runs.running = other;
           runs.stopped_early = Some(run_token);
       }
   }
   ```

   If it's the run being stopped, you now own its `Arc` and flip the flag, all
   without cloning, because you're consuming the stored value, not sharing it.
   If not, `other` holds whatever was taken, and it's moved straight back.

4. **`runs.running.as_ref()`** in `run_speed_test`. After a run finishes it
   clears its own slot, but *only if a newer run hasn't already replaced it*:

   ```rust
   if runs.running.as_ref().is_some_and(|(token, _)| *token == run_token) {
       runs.running = None;
   }
   ```

   Each run carries a unique `run_token`, so comparing the stored token with its
   own answers the "is this still *my* run" question. `.as_ref()` turns the
   `&Option<(String, Arc<AtomicBool>)>` into an `Option<&(String, Arc<AtomicBool>)>`,
   so the closure *borrows* the stored token to inspect it rather than taking
   it out. A textbook case of borrowing to inspect without consuming.

The through-line: in Rust you can usually tell a value's lifetime story just by
reading `clone`, `move`, `&`, `as_ref` and `take` at the call site. Nothing is copied or
shared implicitly.

---

## 12. Build & run it: add a command end-to-end

The real test of the mental model: add a new piece of data to the UI. Every
command in Rove is the same six edits, following the contract from Sections 6 to 8.
Say you want to surface the machine's uptime:

1. **Write the pure logic** in `crates/rove-core/`: a plain
   `pub async fn uptime_secs() -> Option<u64>`. No Tauri, no `#[command]`; it's
   unit-testable on its own (`cargo test -p rove-core`).
2. **Wrap it** in `apps/rove/src-tauri/src/commands.rs` with a thin command:

   ```rust
   #[tauri::command]
   pub async fn get_uptime() -> Option<u64> {
       rove_core::uptime_secs().await
   }
   ```
3. **Register it** as `commands::get_uptime` in the `tauri::generate_handler![...]`
   list in `run`, in `lib.rs`, so the compile-time dispatcher can route
   `"get_uptime"` to it. It must be `pub`, as `lib.rs` reaches it from outside
   the `commands` module. Forgetting this step is
   the classic "command not found" error.
4. **Declare the type** in `apps/rove/src/types/` and add the method to the `NetworkAPI`
   interface: the contract both bridge implementations must satisfy.
5. **Implement the bridge** in `apps/rove/src/bridge/tauri-network-api.ts`
   (`getUptime: () => invokeCommand<number | null>('get_uptime')`) *and* mirror it in
   `apps/rove/src/bridge/mock-network-api.ts` so `pnpm dev` keeps working in a plain browser.
6. **Consume it** from a hook via `useBackendQuery` and render it in a view.

Notice what *doesn't* change: the IPC plumbing, the serialization, the event
system. The architecture from this whole doc (pure core, thin Tauri shell, typed
contract, swappable bridge) is exactly what makes step 1 the only place real
thought goes, and steps 2 to 6 mechanical. The
[add-backend-data](../../../.claude/skills/add-backend-data/SKILL.md) skill
is the same six steps as a checklist.

```bash
pnpm tauri:dev               # build and run the desktop app, hot-reloading the UI
cargo test -p rove-core      # test the pure logic in isolation
```

---

That's the full tour: IPC, ownership, `Option`/`Result`, structs/traits/derive,
async and tokio, generics, shared-state concurrency, and the complete round-trip
across the process boundary, every concept anchored in code you can open and
run. The companion pages go deeper on the two richest subsystems: the
[per-OS data capture](../../networking/data-capture.md) and the
[device-discovery pipeline](../../networking/device-discovery.md).

Previous: [Async, tokio and traits](04-async-and-traits.md). Back to [Contents](README.md).
