# In practice: reading moves, and adding a command

Part 5 of [Learning Rust & Tauri through Rove](README.md).

[← Async, tokio and traits](04-async-and-traits.md) · [Contents →](README.md)

## 11. Ownership & borrowing: read the moves in real code

Section 5 gave the rules. Here are four one-liners from the files above; try to
predict *why each is written the way it is* before reading the answer.

1. **`cancel.clone()`** in `run_speed_test` (`lib.rs:168`). `cancel` is an
   `Arc<AtomicBool>`. It's cloned because *two* owners now need it: the closure
   passed into the speed engine (which polls it to abort mid-stream) and the slot
   stored in `AppState` (so `cancel_speed_test` can flip it from another command).
   Cloning an `Arc` doesn't copy the bool; it bumps a reference count and hands
   back a second handle to the *same* flag. That's how two async tasks share one
   cancellation signal safely.

2. **`async move`** in every `spawn` (`lib.rs:320`). Without `move`, the closure
   would *borrow* the `AppHandle` from the enclosing function, but the spawned
   task outlives that function, so the borrow would dangle. `move` transfers
   ownership into the task. The compiler *requires* it here; it won't let you spawn
   a task that borrows a local.

3. **`slot.take()`** in `cancel_speed_test` (`lib.rs:186`). `slot` is a
   `MutexGuard<Option<Arc<…>>>`. `.take()` moves the `Some(arc)` *out*, leaving
   `None` behind, so you own the `Arc` and can flip its flag, all without cloning,
   because you're consuming the stored value, not sharing it.

4. **`Arc::ptr_eq(c, &cancel)`** in `run_speed_test` (`lib.rs:177`). After a run
   finishes it clears its own cancel slot, but *only if a newer run hasn't already
   replaced it*. `ptr_eq` compares the two `Arc`s by pointer identity (same
   allocation?), not by value, which is exactly the "is this still *my* flag"
   question. A textbook case of borrowing (`&cancel`) to *inspect* without
   consuming.

The through-line: in Rust you can usually tell a value's lifetime story just by
reading `clone` / `move` / `&` / `take` at the call site. Nothing is copied or
shared implicitly.

---

## 12. Build & run it: add a command end-to-end

The real test of the mental model: add a new piece of data to the UI. Every
command in Rove is the same six edits, following the contract from Sections 6–8.
Say you want to surface the machine's uptime:

1. **Write the pure logic** in `crates/rove-core/`: a plain
   `pub async fn uptime_secs() -> Option<u64>`. No Tauri, no `#[command]`; it's
   unit-testable on its own (`cargo test -p rove-core`).
2. **Wrap it** in `src-tauri/src/commands.rs` with a thin command:

   ```rust
   #[tauri::command]
   async fn get_uptime() -> Option<u64> {
       rove_core::uptime_secs().await
   }
   ```
3. **Register it** in the `tauri::generate_handler![…]` list in `lib.rs` so the
   compile-time dispatcher can route `"get_uptime"` to it. Forgetting this step is
   the classic "command not found" error.
4. **Declare the type** in `src/types/` and add the method to the `NetworkAPI`
   interface: the contract both bridge implementations must satisfy.
5. **Implement the bridge** in `src/bridge/tauri-network-api.ts`
   (`() => invoke<number | null>('get_uptime')`) *and* mirror it in
   `src/dev/mock-network-api.ts` so `npm run dev` keeps working in a plain browser.
6. **Consume it** from a hook via `useBackendQuery` and render it in a view.

Notice what *doesn't* change: the IPC plumbing, the serialization, the event
system. The architecture from this whole doc (pure core, thin Tauri shell, typed
contract, swappable bridge) is exactly what makes step 1 the only place real
thought goes, and steps 2–6 mechanical. The
[add-backend-data](../../../../.claude/skills/add-backend-data/SKILL.md) skill
is the same six steps as a checklist.

```bash
npm run tauri:dev            # build + run the desktop app, hot-reloading the UI
cargo test -p rove-core      # test the pure logic in isolation
```

---

That's the full tour: IPC, ownership, `Option`/`Result`, structs/traits/derive,
async and tokio, generics, shared-state concurrency, and the complete round-trip
across the process boundary, every concept anchored in code you can open and
run. The companion pages go deeper on the two richest subsystems: the
[per-OS data capture](../../../networking/data-capture.md) and the
[device-discovery pipeline](../../../networking/device-discovery.md).

---

[← Async, tokio and traits](04-async-and-traits.md) · [Contents →](README.md)
