# Rust basics: functions, Result, ownership, structs

Part 2 of [Learning Rust & Tauri through Rove](README.md).

[← The shape of a Tauri app, and IPC](01-tauri-and-ipc.md) · [Shared state, and the IPC round trip →](03-state-and-the-round-trip.md)

## 3. Your first Rust function, line by line

Look at `get_public_ip` in `apps/rove/src-tauri/src/lib.rs:144`, the smallest complete
command:

```rust
#[tauri::command]
async fn get_public_ip() -> Option<String> {
    rove_core::network_info::public_ip().await
}
```

Five things to unpack, each a core Rust idea:

**`#[tauri::command]`**: an *attribute macro*. It's code that generates code at
compile time. This one wraps your function so Tauri can call it from JavaScript:
it generates the glue to deserialize the incoming JSON arguments, call your
function, and serialize the return value back. You write a plain Rust function;
the macro makes it callable from the frontend. In JS this becomes
`await invoke("get_public_ip")`.

**`async fn` … `.await`**: asynchronous code. Fetching a public IP means a
network round-trip that takes time. `async` means "this function can pause while
waiting instead of blocking the thread." `.await` is where it actually pauses.
Rust's async is *zero-cost*: no garbage collector, no green-thread runtime baked
into the language; you bring your own runtime (Tauri bundles **tokio**).
For now: `async`/`await` = "do slow I/O without freezing."

**`-> Option<String>`**: the return type, and your first taste of Rust's most
important idea: **making absence explicit in the type system.** There's no `null`
in Rust. A value that might not exist is an `Option<T>`, which is *either*:

- `Some(value)`: it's here
- `None`: it's not

You physically cannot forget to handle the `None` case, because the compiler
won't let you touch the inner `String` without first unwrapping the `Option`.
`get_public_ip` returns `Option<String>` because you might be offline, with no IP
available. The "billion-dollar mistake" (null pointer bugs) is designed out of
the language.

---

## 4. `Result`: the other half of "no exceptions"

Rust has no exceptions either. Operations that can *fail* return a
**`Result<T, E>`**: either `Ok(value)` or `Err(error)`. Look at
`get_speed_history` in `apps/rove/src-tauri/src/lib.rs:206`:

```rust
#[tauri::command]
fn get_speed_history(store: tauri::State<'_, Arc<Store>>) -> Result<Vec<SpeedHistoryRecord>, String> {
    store.speed_history().map_err(|e| e.to_string())
}
```

- `Result<Vec<SpeedHistoryRecord>, String>` = "on success, a vector (growable
  array) of records; on failure, a String error message."
- `store.speed_history()` returns a `Result` whose error type is some
  database-error type.
- `.map_err(|e| e.to_string())` transforms *just the error case*: if it failed,
  convert the DB error into a plain `String`. (`|e| ...` is a closure, an inline
  anonymous function, like JS `e => ...`.) Why? Because errors crossing to
  JavaScript must be serializable, and a `String` always is.

When a Tauri command returns `Result`, the frontend's `invoke()` promise
**resolves** on `Ok` and **rejects** on `Err`. So Rust's `Result` maps cleanly
onto a JS `try/catch`. That's the whole error story: `Option` for "might be
absent," `Result` for "might fail." No hidden control flow.

The `?` operator is the payoff. See `relaunch_as_admin` in
`apps/rove/src-tauri/src/commands.rs`:

```rust
let exe = std::env::current_exe().map_err(err_str)?;   // ← the ?
```

`?` means: "if this is `Err`, return that error from the whole function right
now; otherwise unwrap the `Ok` and keep going." It's early-return-on-error in one
character. It's why Rust error handling doesn't drown in `if err != nil`
boilerplate.

---

## 5. Ownership: the concept that makes Rust *Rust*

This is the big one, and `crates/rove-core/src/usage.rs` shows it
beautifully. Rust has **no garbage collector** and yet is memory-safe. How?
Three rules enforced at compile time:

1. Every value has exactly one **owner** (a variable).
2. When the owner goes out of scope, the value is freed, automatically and
   deterministically.
3. You can lend out **references** (`&`) to a value, but the compiler tracks them
   so a reference can never outlive the thing it points to (no dangling
   pointers, ever).

Watch the `&` in `summary` (`usage.rs:189`):

```rust
pub fn summary(&self, networks: &sysinfo::Networks) -> DataUsageSummary {
```

- `&self`: this method **borrows** the `UsageTracker` (read-only). It can look
  at the tracker but doesn't own or consume it, so the caller keeps using it
  afterward.
- `&sysinfo::Networks`: same; it *borrows* the network data to read from it. The
  caller (`get_data_usage` in `lib.rs:192`) still owns it.

Now contrast `sample` (`data_usage.rs:109`):

```rust
pub fn sample(&mut self, networks: &sysinfo::Networks) {
```

`&mut self`: a **mutable** borrow. `sample` needs to *change* the tracker
(update `last_bytes`). Rust's core safety rule: you can have **many readers XOR
one writer**, never both at once. That single rule, checked at compile time,
eliminates entire categories of bugs (data races, use-after-free, iterator
invalidation) with zero runtime cost. This is the thing people mean when they
say "if it compiles, it works."

One more, line 126:

```rust
self.last_bytes.insert(name.clone(), ByteCounts { rx, tx });
```

Why `name.clone()`? `name` is a *borrowed* `&String` from the loop. The HashMap
needs to **own** its keys (it outlives the loop). You can't stuff a borrow into
something that outlives it; the compiler forbids it. So you `.clone()` to make an
owned copy the map can keep. `.clone()` is always explicit in Rust: copies never
happen silently, so you always know where you're paying for one.

---

## 6. Structs, `impl`, and the `derive` shorthand

Rust isn't object-oriented, but it has **structs** (data) and **`impl` blocks**
(methods on that data). `UsageTracker` (`data_usage.rs:92`):

```rust
pub struct UsageTracker {
    store: Arc<Store>,
    last_bytes: HashMap<String, ByteCounts>,
    first_sample_recorded: bool,
}

impl UsageTracker {
    pub fn new(store: Arc<Store>) -> Self { ... }   // constructor by convention
    pub fn sample(&mut self, ...) { ... }            // method (takes &mut self)
    pub fn summary(&self, ...) -> ... { ... }        // method (takes &self)
}
```

`new` is just a convention (not a keyword) for a constructor. `Self` means "this
type." Methods that take `self`/`&self`/`&mut self` are called with dot syntax
(`tracker.sample(...)`); functions without `self` are "associated functions"
called with `::` (`UsageTracker::new(...)`).

Now the magic line you'll see *everywhere* in `types.rs:5`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionDetails { ... }
```

`#[derive(...)]` auto-generates trait implementations so you don't hand-write
them. A **trait** is like an interface: a set of behaviors a type can implement.
Here:

- `Debug` → printable for debugging (`{:?}`)
- `Clone` → gets a `.clone()` method
- `Serialize`/`Deserialize` → **this is the Tauri bridge.** These come from
  **serde**, Rust's serialization library. `Serialize` means "this struct can
  turn into JSON", which is *exactly* how it crosses to the frontend. Every type
  a command returns must be `Serialize`.
- `#[serde(rename_all = "camelCase")]` → Rust convention is `snake_case`
  (`signal_strength`), but JS wants `camelCase` (`signalStrength`). This attribute
  renames every field during serialization so the existing React code consumes
  them unchanged.

So the full data path is: Rust struct → `derive(Serialize)` → serde turns it to
JSON → IPC bridge → TypeScript object in your React component. The types on both
sides are kept in sync by hand (that's what `types.rs` mirrors).

---

---

[← The shape of a Tauri app, and IPC](01-tauri-and-ipc.md) · [Shared state, and the IPC round trip →](03-state-and-the-round-trip.md)
