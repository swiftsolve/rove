#!/bin/sh
# Grant Rove the single capability it needs to bind UDP :67 for passive DHCP
# fingerprinting, so the feature works without running the whole app as root.
#
# Best-effort: if setcap is missing (or the filesystem doesn't support file
# capabilities), we leave the binary untouched and DHCP fingerprinting simply
# reports "unavailable" in the UI — every other feature is unaffected.
set -e

BIN=/usr/bin/Rove

if command -v setcap >/dev/null 2>&1 && [ -x "$BIN" ]; then
    setcap 'cap_net_bind_service=+ep' "$BIN" || true
fi

exit 0
