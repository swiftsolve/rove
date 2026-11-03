# Shared state, and the IPC round trip

Part 3 of [Learning Rust & Tauri through Rove](README.md).

[← Rust basics: functions, Result, ownership, structs](02-rust-basics.md) · [Async, tokio and traits →](04-async-and-traits.md)

## 7. Shared state & fearless concurrency

Rove runs background loops (sampling usage every 30s, broadcasting throughput
every 1s) *and* handles commands, all touching shared state. In most languages
that's a minefield. Rust makes the danger visible in the types. Look at
`AppState` (`src-tauri/src/lib.rs:16`):

```rust
struct AppState {
    speed_cancel: Mutex<Option<Arc<AtomicBool>>>,
    usage: Mutex<Option<UsageTracker>>,
    networks: Mutex<sysinfo::Networks>,
    is_throughput_subscribed: AtomicBool,
    ...
}
```

Three concurrency primitives, each teaching something:

- **`Arc<T>`** = "Atomically Reference-Counted": a shared-ownership pointer.
  Remember rule 1 (one owner)? `Arc` is the escape hatch when *many* places need
  to share the same value: it keeps a thread-safe count and frees the value when
  the last `Arc` drops. That's why `Store` is wrapped in `Arc`: both the usage
  tracker and the command handlers hold a handle to the *same* database.

- **`Mutex<T>`**: a lock. To touch the data inside, you must `.lock()` it first,
  which hands you a guard; only the guard lets you reach the value, and when the
  guard drops, the lock releases. Rust ties "holding the lock" to "having the
  guard," so you *cannot* forget to unlock or accidentally read the data without
  locking. The type system enforces the discipline.

- **`AtomicBool`**: a single bool you can flip from any thread without a lock,
  used for simple flags like `is_throughput_subscribed`.

There's a lovely real-world detail at `lock()` (`src-tauri/src/lib.rs:34`):

```rust
fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}
```

If a thread panics *while holding* a Mutex, Rust marks it "poisoned", a signal
that the protected data might be in a half-updated state. The default `.lock()`
returns an `Err` in that case. This helper says "recover the data anyway instead
of crashing every future caller." This is idiomatic Rust: the type forces you to
confront the poisoned case, and you make a deliberate choice.

---

## 8. The full IPC round-trip, traced through Rove

Now let's follow real data across the process boundary, both directions, using
Rove's actual files.

### The bridge indirection (an architecture lesson)

Notice that Rove's React components **never call `invoke` directly.** They call
`window.networkAPI.getDataUsage()`. That `window.networkAPI` object is installed
at startup by `src/bridge/tauri-network-api.ts` (`installTauriBridge`), and it's the
*only* file that imports `invoke`. Why the indirection? Because there's a second
implementation, `src/dev/mock-network-api.ts`, used when the UI runs in a plain
browser (no Rust backend). The components are written against an interface
(`NetworkAPI`); at runtime either the real Tauri bridge or the mock is slotted in.
This is the same "program to an interface" idea as `rove-core` staying
Tauri-free: swappable implementations behind a stable boundary.

### Direction A: a command (request → reply)

Trace `get_data_usage`, the Home screen's usage numbers:

1. **React** wants data, calls `window.networkAPI.getDataUsage()`.
2. **Bridge** (`tauri-network-api.ts:48`): `() => invoke<DataUsageSummary>('get_data_usage')`.
   `invoke` is from `@tauri-apps/api/core`. The `<DataUsageSummary>` is just a
   TypeScript type annotation for *your* benefit. It does nothing at runtime; it
   promises the compiler that whatever comes back is shaped like that type.
3. **`invoke` serializes the call** (command name `"get_data_usage"` plus an args
   object, empty here) into a message and hands it to the webview's IPC channel
   (Tauri exposes it on `window.__TAURI_INTERNALS__`). This crosses the *process
   boundary*. It returns a `Promise` immediately.
4. **Rust receives it.** Back in `src-tauri/src/lib.rs:640`, the
   `tauri::generate_handler![...]` macro built a dispatcher at compile time: it
   takes the incoming command name string and routes `"get_data_usage"` to your
   `get_data_usage` function.
5. **The function runs** (`lib.rs:192`):

   ```rust
   #[tauri::command]
   fn get_data_usage(state: tauri::State<'_, AppState>) -> DataUsageSummary {
   ```

   Note: `state: tauri::State<AppState>` was **not** sent from JavaScript; the JS
   call passed no arguments. Tauri recognizes certain "special" parameter types
   (`State`, `AppHandle`, `Window`) and **injects them on the Rust side** from the
   app's managed state. Only *ordinary* parameters are read from the JSON args.
   (That's why `saveSpeedResult(entry)` in the bridge passes `{ entry }`, and the
   Rust fn declares `entry: SpeedHistoryRecord`: the JSON key must match the
   parameter name.)
6. **The return value is serialized.** `DataUsageSummary` derives `Serialize`, so
   serde turns it into JSON, and Tauri sends it back across the boundary.
7. **The Promise resolves** with that JSON, now typed as `DataUsageSummary` on the
   JS side. If the command had returned `Result::Err`, the Promise would **reject**
   instead. The bridge (`src/bridge/tauri-network-api.ts`) turns the error
   string into an `Error`, and `useBackendQuery` shows its message.
8. **React re-renders** with the new data.

That's the whole loop: JS call → serialize → cross boundary → dispatch → run →
serialize → cross back → resolve Promise → re-render.

### Direction B: an event (backend pushes, unprompted)

Live throughput isn't something the UI asks for repeatedly; Rust *pushes* a
sample every second. Trace `live-throughput`:

1. **Rust loop** (`spawn_throughput_broadcaster`, `lib.rs:342`) wakes every second
   and calls:

   ```rust
   let _ = handle.emit("live-throughput", &sample);
   ```

   `emit` serializes `sample` (a `LiveThroughput`, which derives `Serialize`) and
   broadcasts it to the webview as a named event. The `let _ =` deliberately
   ignores the `Result`: if the UI window is gone, a failed emit is harmless.
2. **JS is listening.** In the bridge, `onLiveThroughput` (`tauri-network-api.ts:63`)
   calls `subscribeEvent('live-throughput', callback)`, which uses `listen` from
   `@tauri-apps/api/event` to register a handler for that event name.
3. **Each emit fires the callback** with the deserialized payload, which flows into
   `useLiveThroughput.ts` → `setState` → the chart re-renders.

### The two directions combined

Live throughput actually uses **both** directions together, which is a nice
pattern to internalize:

- A **command** turns the tap on/off: `subscribe_live_throughput` /
  `unsubscribe_live_throughput` (`lib.rs:240-248`) just flip an `AtomicBool`. The
  Rust loop only emits while that flag is true (`lib.rs:349`).
- The **event** stream (`live-throughput`) is the water flowing through the tap.

So: commands are for "do this / give me that, and reply"; events are for a
continuous or unsolicited stream. The subscribe command is the request to *start*
the stream; the stream itself arrives as events. Rove's `useLiveThroughput` hook
even reference-counts the subscribe command (`backendRefCount`, line 53) so that N
React consumers share one backend subscription: the first attach turns the tap on,
the last detach turns it off.

---

---

[← Rust basics: functions, Result, ownership, structs](02-rust-basics.md) · [Async, tokio and traits →](04-async-and-traits.md)
