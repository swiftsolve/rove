#!/bin/sh
set -e

# Load Beacon's AppArmor profile. On Ubuntu 24.04+/26.04 — and any distro with
# kernel.apparmor_restrict_unprivileged_userns=1 — WebKitGTK's sandboxed
# WebProcess cannot create the unprivileged user namespace its bubblewrap
# sandbox needs unless a profile grants it. Without this, the desktop-launched
# app shows its window chrome but leaves the web content blank (the WebProcess
# is killed at startup). The profile is flags=(unconfined) and only adds the
# `userns` permission, matching what Ubuntu ships for browsers.
if command -v apparmor_parser >/dev/null 2>&1 \
   && [ -d /sys/kernel/security/apparmor ] \
   && [ -f /etc/apparmor.d/beacon ]; then
    apparmor_parser -r -W /etc/apparmor.d/beacon 2>/dev/null || true
fi

# Refresh desktop/icon caches (harmless no-ops if the tools aren't installed).
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database -q /usr/share/applications 2>/dev/null || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor 2>/dev/null || true
fi

exit 0
