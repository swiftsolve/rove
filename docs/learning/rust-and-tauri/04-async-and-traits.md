# Async, tokio and traits

Part 4 of [Learning Rust & Tauri through Rove](README.md).

Previous: [Shared state, and the IPC round trip](03-state-and-the-round-trip.md). Next: [In practice: reading moves, and adding a command](05-in-practice.md).

## 9. Async & tokio: the background loops

Sections 1 to 8 covered code that runs *when the UI asks*. But Rove also runs work
*on its own*: sampling usage every 30 s, broadcasting throughput every second,
watching for cable pulls. These are **long-lived async tasks**, and Tauri bundles
**tokio** to run them.

`tauri::async_runtime::spawn(future)` hands a future to tokio's scheduler. Think
`std::thread::spawn`, but the tasks are cheap green tasks multiplexed onto a small
thread pool, not one OS thread each. All the loops live in
`apps/rove/src-tauri/src/monitors.rs`, and `setup` in `lib.rs` starts them.
`spawn_usage_sampler` is the simplest shape (the sample itself left out):

```rust
tauri::async_runtime::spawn(async move {
    loop {
        // ... take a sample ...
        tokio::time::sleep(USAGE_SAMPLE_INTERVAL).await;
    }
});
```

The `.await` on `sleep` is the crucial bit: it **yields** the thread back to the
runtime for the interval (30 s) instead of blocking it, so a few runtime threads
can host every loop `monitors.rs` starts at once. There are eight: usage,
per-app usage, hosts, live throughput, the passive device refresh, the route
monitor, and the internet and services heartbeats. `async move` means the closure *takes ownership* of everything it captures
(here, the `AppHandle`), required because the task outlives the function that
spawned it, so it can't borrow.

Two production details are worth internalizing:

- **Panic isolation.** Each sample tick runs in `spawn_blocking`
  (`monitors.rs`), since it writes the database, and a panic there comes back
  as an `Err` from the join. It's logged and the loop goes on, so a single bad
  reading can't kill the loop and silently stop usage tracking for the rest of
  the session. The loop is a *supervisor*.
- **The tap pattern (command and event, combined).** `spawn_throughput_broadcaster`
  wakes every second but only emits while the `is_throughput_subscribed` flag is
  set, the `AtomicBool` the `subscribe_live_throughput` command flips. On the
  first tick after subscribing again it calls `sampler.prime()` and *skips one
  emit*, so the idle gap since the last subscription isn't reported as a single
  giant Mbps spike. That's the whole "commands turn the stream on;
  events are the stream" idea from Section 8, in ten lines.

The `speed-test-progress` stream (Section 8's Direction B, but request-scoped
rather than a standing loop) works the same way: `run_speed_test`, in
`apps/rove/src-tauri/src/commands.rs`, hands the speed engine
(`rove_core::speed::run`) a closure that calls `emit_to_ui` once per progress
update, so the progress bar fills live while the `await` is still pending.

---

## 10. Traits & generics: one monitor, three operating systems

Rust reaches for **generics** the way other languages reach for interfaces or
duck typing, but resolved at *compile time*, with zero runtime cost. The route
monitor is a clean real example. Linux watches `ip monitor route`, macOS
watches `route -n monitor`, and Windows blocks on a long-lived PowerShell. All
three do the *same thing*: spawn a child process,
read one line per network change, debounce it into a `network-changed` event, and
respawn the child (with backoff) if it dies. Only *how you spawn the child*
differs.

So the shared logic is written once, generic over "a thing that makes a command":

```rust
async fn monitor_connectivity<F>(handle: tauri::AppHandle, spawn: F)
where
    F: Fn() -> tokio::process::Command,
{ ... }
```

`<F>` declares a type parameter; the `where F: Fn() -> tokio::process::Command`
clause **bounds** it: `F` can be any type, as long as it's a closure (or fn) that
takes nothing and returns a `Command`. Its three callers, in
`spawn_route_monitor`, pass different closures: one builds an `ip` command, one a
`route` command, and one a `powershell` command. Rust **monomorphizes**: it stamps out a specialized copy of
`monitor_connectivity` for each concrete `F` at compile time, so there's no
dynamic dispatch and no boxing; the closure is inlined as if you'd hand-written
two functions. The `#[cfg(target_os = "…")]` attributes mean only the arm for the
platform you're building even compiles.

The body of `monitor_connectivity`, in `monitors.rs`, is a small lesson in
resilient systems code: it reads
lines with `tokio::io::BufReader`, debounces bursts (`>= 800 ms` between emits so a
flurry of route changes collapses to one UI nudge), sets `kill_on_drop(true)` so
the child can't be orphaned when the app exits, and on child death respawns with
**exponential backoff**: a monitor that stayed up a minute resets the backoff to
1 s; rapid crashes double it up to a 30 s cap, so a permanently broken monitor
degrades to occasional retries instead of a busy-loop.

### The other kind of generic: `derive`

Section 6 showed `#[derive(Serialize)]`. That's the *same* trait machinery from
the other side: `Serialize` is a trait, and `#[derive]` auto-generates the
`impl Serialize for ConnectionDetails { ... }` you'd otherwise hand-write. When
serde's `to_string` is called on your struct, the compiler already knows (again
at compile time, monomorphized) exactly how to walk its fields. Traits are the
one idea behind both "write logic once over many types" (generics) and "many types
share one behaviour" (`derive`, trait objects).

Previous: [Shared state, and the IPC round trip](03-state-and-the-round-trip.md). Next: [In practice: reading moves, and adding a command](05-in-practice.md).
