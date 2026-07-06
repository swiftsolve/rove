#!/bin/sh
set -e

# Unload the AppArmor profile, but only on final removal — never on upgrade,
# or we'd tear down the profile the freshly-installed version just loaded.
# dpkg passes "remove"/"purge" as $1; rpm passes "0" (packages remaining) on
# the last uninstall. In both cases /etc/apparmor.d/beacon still exists at this
# point (dpkg/rpm delete package files afterwards), so -R can find it.
case "$1" in
  remove|purge|0)
    if command -v apparmor_parser >/dev/null 2>&1 && [ -f /etc/apparmor.d/beacon ]; then
        apparmor_parser -R /etc/apparmor.d/beacon 2>/dev/null || true
    fi
    ;;
esac

exit 0
