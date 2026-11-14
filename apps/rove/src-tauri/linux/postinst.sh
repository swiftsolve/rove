#!/bin/sh
set -e

# Load Rove's AppArmor profile. On Ubuntu 24.04+/26.04 — and any distro with
# kernel.apparmor_restrict_unprivileged_userns=1 — WebKitGTK's sandboxed
# WebProcess cannot create the unprivileged user namespace its bubblewrap
# sandbox needs unless a profile grants it. Without this, the desktop-launched
# app shows its window chrome but leaves the web content blank (the WebProcess
# is killed at startup). The profile is flags=(unconfined) and only adds the
# `userns` permission, matching what Ubuntu ships for browsers.
if command -v apparmor_parser >/dev/null 2>&1 \
   && [ -d /sys/kernel/security/apparmor ] \
   && [ -f /etc/apparmor.d/rove ]; then
    apparmor_parser -r -W /etc/apparmor.d/rove 2>/dev/null || true
fi

# Grant the one capability passive DHCP fingerprinting needs to bind UDP :67,
# so it works without running the whole app as root. Best-effort: if setcap is
# missing (or the filesystem doesn't support file capabilities), the binary is
# left alone and DHCP fingerprinting reports "unavailable"; nothing else changes.
# The capability lives on the binary, so dpkg drops it when it deletes the file.
if command -v setcap >/dev/null 2>&1 && [ -x /usr/bin/Rove ]; then
    setcap 'cap_net_bind_service=+ep' /usr/bin/Rove 2>/dev/null || true
fi

# Refresh desktop/icon caches (harmless no-ops if the tools aren't installed).
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database -q /usr/share/applications 2>/dev/null || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor 2>/dev/null || true
fi

exit 0
