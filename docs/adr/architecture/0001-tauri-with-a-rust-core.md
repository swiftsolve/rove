---
status: accepted
date: 2026-11-07
---

# A Tauri shell over a Rust core crate that knows nothing of Tauri

Rove is a React UI in a Tauri v2 webview over Rust. Every probe, scan and
measurement lives in `crates/rove-core`, a plain library with no Tauri
dependency; `apps/rove/src-tauri` only wraps its services as commands, events and the
window. Tauri gives a small binary with no Node runtime in the UI process and
a deny-by-default capability list (`apps/rove/src-tauri/capabilities/default.json`),
for an app that reads its user's network.

## Considered options

- **Electron.** A bundled Chromium and a Node process with full system access,
  for a monitor that's meant to stay tiny and trustworthy.

## Consequences

- **The core is tested without a window** (`cargo test -p rove-core`), and its
  services can move to another shell or a CLI untouched.
- **Each OS has its own webview** (WebKitGTK, WKWebView, WebView2), so the UI
  can't assume what a browser does for free ([ADR 0007](../frontend/0007-history-shortcuts.md)).
