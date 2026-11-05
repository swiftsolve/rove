# Learning Rust & Tauri through Rove

A guided tour of Rust and Tauri using Rove's own source code as the textbook.
Every concept points at real code in this repo, with file/line references you can
click through in your editor.

> **Companion pages:**
> - [How Rove Is Put Together](../../architecture.md): the same boundary as a set of
>   diagrams: the bridge's two implementations, pull vs push, and the anatomy of
>   one `invoke`.
> - [How Rove Captures Network Data (per OS)](../../networking/data-capture.md): a
>   deep dive into the per-OS probes (`ip`/`netsh`/CoreWLAN, byte counters) that
>   feed everything below.
> - [How Rove Discovers & Identifies LAN Devices](../../networking/device-discovery.md): the
>   full device-scan pipeline: the ARP-table trick, TCP/mDNS probing, OUI vendor
>   lookup, and the weighted-vote classifier.

## Contents

1. [The shape of a Tauri app, and IPC](01-tauri-and-ipc.md)
2. [Rust basics: functions, Result, ownership, structs](02-rust-basics.md)
3. [Shared state, and the IPC round trip](03-state-and-the-round-trip.md)
4. [Async, tokio and traits](04-async-and-traits.md)
5. [In practice: reading moves, and adding a command](05-in-practice.md)
