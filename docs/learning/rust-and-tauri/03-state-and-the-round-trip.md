# Shared state, and the IPC round trip

Part 3 of [Learning Rust & Tauri through Rove](README.md).

Previous: [Rust basics: functions, Result, ownership, structs](02-rust-basics.md). Next: [Async, tokio and traits](04-async-and-traits.md).

## 7. Shared state & fearless concurrency

Rove runs background loops (sampling usage every 30s, broadcasting throughput
every 1s) *and* handles commands, all touching shared state. In most languages
that's a minefield. Rust makes the danger visible in the types. Look at
`AppState` in `apps/rove/src-tauri/src/lib.rs` (doc comments and some fields
left out):

```rust
struct AppState {
    speed_runs: Mutex<SpeedRuns>,
    usage: Mutex<Option<UsageTracker>>,
    ...
    networks: Mutex<sysinfo::Networks>,
    ...
    is_throughput_subscribed: AtomicBool,
    ...
}
```

`SpeedRuns`, just above it, holds the running speed test's token and its cancel
flag (an `Arc<AtomicBool>`); chapter 5 reads how it's used.

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

There's a lovely real-world detail in `lock`, in
`crates/rove-core/src/utils/net.rs`, which both crates call instead of
`.lock()`:

```rust
pub fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
}
```

If a thread panics *while holding* a Mutex, Rust marks it "poisoned", a signal
that the protected data might be in a half-updated state. The default `.lock()`
returns an `Err` (a `PoisonError`) in that case. This helper says "recover the
data anyway instead of crashing every future caller": `unwrap_or_else` passes
that error to `PoisonError::into_inner`, a function named rather than written
out as a closure, which hands back the guard inside it. This is idiomatic Rust:
the type forces you to confront the poisoned case, and you make a deliberate
choice.

---

## 8. The full IPC round-trip, traced through Rove

Now let's follow real data across the process boundary, both directions, using
Rove's actual files.

### The bridge indirection (an architecture lesson)

Notice that Rove's React components **never call `invoke` directly.** They call
`window.networkAPI.getDataUsage()`. That `window.networkAPI` object is installed
at startup by `installTauriBridge` in `apps/rove/src/bridge/tauri-network-api.ts`,
and that's the *only* file that imports `invoke`. Why the indirection? Because there's a second
implementation, `apps/rove/src/bridge/mock-network-api.ts`, used when the UI runs in a plain
browser (no Rust backend). The components are written against an interface
(`NetworkAPI`); at runtime either the real Tauri bridge or the mock is slotted in.
This is the same "program to an interface" idea as `rove-core` staying
Tauri-free: swappable implementations behind a stable boundary.

### Direction A: a command (request, then reply)

Trace `get_data_usage`, the Home screen's usage numbers:

1. **React** wants data, calls `window.networkAPI.getDataUsage()`.
2. **Bridge** (`tauri-network-api.ts`):
   `getDataUsage: () => invokeCommand<DataUsageSummary>('get_data_usage')`.
   `invokeCommand`, in the same file, calls `invoke` from `@tauri-apps/api/core`
   and turns a rejected string into an `Error`. The `<DataUsageSummary>` is just a
   TypeScript type annotation for *your* benefit. It does nothing at runtime; it
   promises the compiler that whatever comes back is shaped like that type.
3. **`invoke` serializes the call** (command name `"get_data_usage"` plus an args
   object, empty here) into a message and hands it to the webview's IPC channel
   (Tauri exposes it on `window.__TAURI_INTERNALS__`). This crosses the *process
   boundary*. It returns a `Promise` immediately.
4. **Rust receives it.** In `run`, in `apps/rove/src-tauri/src/lib.rs`, the
   `tauri::generate_handler![...]` macro built a dispatcher at compile time: it
   takes the incoming command name string and routes `"get_data_usage"` to your
   `get_data_usage` function in `apps/rove/src-tauri/src/commands.rs`.
5. **The function runs**:

   ```rust
   #[tauri::command]
   pub async fn get_data_usage(app: tauri::AppHandle) -> DataUsageSummary {
       let summary = tokio::task::spawn_blocking(move || {
           let state = app.state::<AppState>();
   ```

   Note: `app: tauri::AppHandle` was **not** sent from JavaScript; the JS call
   passed no arguments. Tauri recognizes certain "special" parameter types
   (`State`, `AppHandle`, `Window`) and **injects them on the Rust side**. Only
   *ordinary* parameters are read from the JSON args. The summary reads the
   store from disk, so the work runs on tokio's blocking pool
   (`spawn_blocking`), and the closure fetches `AppState` there through the
   handle. It takes an `AppHandle` rather than a `State` because a `State`
   borrows from Tauri, and a closure sent to another thread can't hold a
   borrow; the handle is an owned value that can move in.
   (That's why `saveSpeedResult(entry)` in the bridge passes `{ entry }`, and the
   Rust fn declares `entry: SpeedHistoryRecord`: the JSON key must match the
   parameter name.)
6. **The return value is serialized.** `DataUsageSummary` derives `Serialize`, so
   serde turns it into JSON, and Tauri sends it back across the boundary.
7. **The Promise resolves** with that JSON, now typed as `DataUsageSummary` on the
   JS side. If the command had returned `Result::Err`, the Promise would **reject**
   instead. The bridge (`apps/rove/src/bridge/tauri-network-api.ts`) turns the error
   string into an `Error`, and `useBackendQuery` shows its message.
8. **React re-renders** with the new data.

That's the whole loop: the JS call is serialized, crosses the boundary, is
dispatched and run, and its result is serialized, crosses back, resolves the
Promise, and React re-renders.

### Direction B: an event (backend pushes, unprompted)

Live throughput isn't something the UI asks for repeatedly; Rust *pushes* a
sample every second. Trace `live-throughput`:

1. **Rust loop** (`spawn_throughput_broadcaster` in
   `apps/rove/src-tauri/src/monitors.rs`) wakes every second and calls:

   ```rust
   emit_to_ui(&handle, "live-throughput", &sample);
   ```

   `emit_to_ui` (in `apps/rove/src-tauri/src/ui_events.rs`) calls Tauri's
   `handle.emit`, which serializes `sample` (a `LiveThroughput`, which derives
   `Serialize`) and broadcasts it to the webview as a named event. `emit`
   returns a `Result`; `emit_to_ui` hands it to `log_if_failed`, which writes a
   warning to the log on an `Err` rather than returning it. A failed emit (the
   app shutting down, say) can't fail the loop, but it still leaves a trace, and
   the UI's poll catches up either way.
2. **JS is listening.** In the bridge, `onLiveThroughput` (`tauri-network-api.ts`)
   calls `subscribeEvent('live-throughput', callback)`, which uses `listen` from
   `@tauri-apps/api/event` to register a handler for that event name.
3. **Each emit fires the callback** with the deserialized payload. In
   `apps/rove/src/features/live-throughput/hooks/useLiveThroughput.ts`,
   `ingestSample` adds it to the store's history and calls every listener;
   `useLiveThroughput` reads that store through React's `useSyncExternalStore`,
   so the Traffic chart re-renders.

### The two directions combined

Live throughput actually uses **both** directions together, which is a nice
pattern to internalize:

- A **command** turns the tap on or off: `subscribe_live_throughput` and
  `unsubscribe_live_throughput` (in `apps/rove/src-tauri/src/commands.rs`) just
  flip an `AtomicBool`. The loop in `spawn_throughput_broadcaster` reads that
  flag each second and emits only while it's true.
- The **event** stream (`live-throughput`) is the water flowing through the tap.

So: commands are for "do this, or give me that, and reply"; events are for a
continuous or unsolicited stream. The subscribe command is the request to
*start* the stream; the stream itself arrives as events. On the React side, one
hook owns the tap: `useLiveThroughputSource`, which `NetworkProvider` calls once
with whether the window is visible. It turns the tap on when the window shows;
when it hides, it waits a 2 s grace period (`SUBSCRIPTION_GRACE_MS`) before
turning it off, so a brief blip or a StrictMode remount doesn't flip the
backend flag off and on. Every component that shows the data calls
`useLiveThroughput`, which only reads the store and never touches the tap.

Previous: [Rust basics: functions, Result, ownership, structs](02-rust-basics.md). Next: [Async, tokio and traits](04-async-and-traits.md).
