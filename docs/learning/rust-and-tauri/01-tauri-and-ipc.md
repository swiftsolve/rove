# The shape of a Tauri app, and IPC

Part 1 of [Learning Rust & Tauri through Rove](README.md).

Back to [Contents](README.md). Next: [Rust basics: functions, Result, ownership, structs](02-rust-basics.md).

## 1. The shape of a Tauri app

A Tauri app is two worlds glued together:

<div align="center">
  <img src="../../assets/tauri-ipc.svg" width="820" alt="A webview process running React and a native process running Rust: commands go from React to Rust through invoke(), events from Rust to React through emit(), each copied across as JSON" />
</div>

The frontend is literally a web page. It can't open a socket or read `/sys`.
When it needs something native, it **invokes a command**: it sends a JSON message
across the IPC bridge to a Rust function, which does the real work and returns
JSON. That's the entire mental model. Electron does the same thing but ships a
whole Chromium + Node; Tauri uses the OS's built-in webview and a Rust core, so
the binary is tiny.

Rove splits the Rust side into **two crates** (a "crate" = a Rust compilation
unit / library or binary):

- `crates/rove-core/`: pure logic. The doc comment at the top of its `lib.rs`
  says it: *"Pure Rust with no Tauri or GTK dependency, so it compiles and tests
  anywhere."* This is where the actual network measuring lives.
- `apps/rove/src-tauri/`: the thin Tauri shell. Its `lib.rs` opens with *"Thin
  Tauri shell over rove-core: each command wraps one service."* The commands
  live in `commands.rs`, the background loops in `monitors.rs`, and the helper
  that pushes events to the UI in `ui_events.rs`.

That separation is a deliberate architecture lesson: keep your real logic free
of framework dependencies so you can unit-test it and reason about it in
isolation. The Tauri layer just wires it to the UI.

---

## 2. What IPC actually is

**IPC = Inter-Process Communication.** It's the general term for any mechanism
that lets two *separate running programs* (processes) exchange data. They don't
share memory (each process has its own isolated address space, protected by the
operating system), so they can't just read each other's variables. They have to
pass **messages** through a channel the OS provides: pipes, sockets, shared
memory regions, etc.

### Why Rove needs IPC at all

A Tauri app is not one program; it's (at least) **two processes**:

1. The **webview process**: the OS's browser engine (WebKit on macOS/Linux,
   WebView2/Edge on Windows) running your React UI. It's sandboxed: no file
   access, no sockets, no ability to run a ping.
2. The **Rust process**: your native binary with full OS access.

They are genuinely separate processes with separate memory. So when your React
code needs the public IP, it *cannot* call the Rust function directly: the
function lives in a different process's memory that the webview can't see. The
only way across the boundary is to send a message. That message-passing is the
IPC.

### The channel Tauri uses

Tauri hides the plumbing behind two directions of message flow:

- **Frontend to backend: commands.** The JS calls
  `invoke("get_public_ip", { args })`. Tauri serializes the call (command name and
  arguments) into JSON, ships it across the IPC channel, and on the Rust side
  deserializes it, finds the matching `#[tauri::command]` function, runs it, then
  serializes the return value back as JSON. `invoke` returns a `Promise`, so from
  JS it feels like a normal async function call; the process boundary and the
  JSON round-trip are invisible.

- **Backend to frontend: events.** Rust can push messages the other way *without*
  being asked. Rove sends every event through one helper, `emit_to_ui` in
  `apps/rove/src-tauri/src/ui_events.rs`, which calls Tauri's
  `handle.emit(event, payload)` and logs a failed emit. The frontend subscribes
  with `listen("event-name", handler)`. Rove uses this for anything streaming
  or unsolicited: `speed-test-progress` (progress bar updates during a speed
  test), `live-throughput` (a sample every second), and `network-changed`
  (fired the instant a cable is pulled). See `run_speed_test` in
  `apps/rove/src-tauri/src/commands.rs`, which emits `speed-test-progress` from
  its progress callback, and `spawn_throughput_broadcaster` in
  `apps/rove/src-tauri/src/monitors.rs`, which emits `live-throughput` once a
  second.

### Why everything must be JSON-serializable

Because the data is *copied across a process boundary as text*, both sides only
ever exchange things that can be turned into JSON and back. This is exactly why:

- Every type a command returns derives `Serialize` (see `NetworkInfo` in `crates/rove-core/src/connection.rs`).
- Command errors are a `CommandError` that serializes as its message string: a
  rich Rust error type can't cross the wire, but a string can.
- The Rust structs use `#[serde(rename_all = "camelCase")]` so the JSON keys
  match what the TypeScript side expects.

You never share a pointer or a live object between the two sides, only values
copied as JSON. Keeping that picture in your head explains most of Tauri's API
design.

### The mental model in one line

> The webview and the Rust core are two isolated processes. IPC is the postal
> service between them: commands are letters you send and wait for a reply to;
> events are letters the backend sends you unprompted. Every letter is written
> in JSON.

Back to [Contents](README.md). Next: [Rust basics: functions, Result, ownership, structs](02-rust-basics.md).
