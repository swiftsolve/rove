# macOS DHCP capture helper

Passive DHCP fingerprinting needs to bind UDP `:67`. On Linux the installer grants
`cap_net_bind_service`; on Windows there's no low-port restriction. **macOS** reserves
ports below 1024 for root and has **no per-app capability grant**, so the app can't
bind `:67` itself. A small root helper does the capture instead and hands results to
the app over a file.

## Architecture

```
rove-dhcp-helper (root LaunchDaemon)          Rove.app (normal user)
  binds :67, parses DHCP  ──writes JSON──►  /Library/Application Support/Rove/
                                              dhcp-cache.json
                                                     │
                                                     └─ read by dhcp::snapshot()
```

- Helper: `rove-dhcp-helper` (built from `crates/rove-core/src/bin/`). Reuses the exact
  parse/classify code the in-process listener uses, so captures are identical.
- IPC: an atomically-written JSON file (no XPC). The app's `dhcp::snapshot()` already
  merges `dhcp::helper_cache_path()` when present, so no app-side change is needed to
  consume it.

## Test it now (manual, no signing)

Binding `:67` needs root, so run the helper under `sudo`:

```bash
# 1. build
cargo build --release --bin rove-dhcp-helper

# 2. run the helper as root, writing to a temp file
sudo ./target/release/rove-dhcp-helper /tmp/rove-dhcp.json

# 3. in another terminal, reconnect a device's Wi-Fi, then watch the file fill:
cat /tmp/rove-dhcp.json
```

Point the app at the same path (or use the default `helper_cache_path()`) and its
Devices tab will show the DHCP-derived hostnames/OS even though the app is unprivileged.

## Productionize (needs your Developer ID)

These steps require code signing / notarization and run on your Mac:

1. **Bundle the helper** into the app: copy `rove-dhcp-helper` to
   `/Library/Application Support/Rove/` and the plist to `/Library/LaunchDaemons/`
   (`root:wheel`, plist `0644`, binary `0755`).
2. **Install with an admin prompt** on first opt-in — from the app, an
   `AuthorizationExecuteWithPrivileges` flow or a one-shot
   `osascript -e 'do shell script "… launchctl bootstrap system …" with administrator privileges'`
   copies the files and loads the daemon:
   ```bash
   launchctl bootstrap system /Library/LaunchDaemons/com.rove.dhcp-helper.plist
   ```
3. **Sign** the helper binary with the same Developer ID as the app and **notarize**;
   otherwise Gatekeeper blocks the daemon.
4. **Uninstall**: `launchctl bootout system/com.rove.dhcp-helper` and remove the files.

> A cleaner long-term option is `SMAppService.daemon` (macOS 13+), which registers the
> daemon from within the signed app bundle with no manual `launchctl`. It still requires
> signing and a bundled `Contents/Library/LaunchDaemons/` plist; the file-IPC design here
> is unchanged either way — only the install/registration differs.
