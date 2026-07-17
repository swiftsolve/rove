#!/bin/sh
set -e

# Unload the AppArmor profile, but only on final removal — never on upgrade,
# or we'd tear down the profile the freshly-installed version just loaded.
# dpkg passes "remove"/"purge" as $1 (and "upgrade" on an upgrade, which we
# deliberately skip). /etc/apparmor.d/rove still exists at this point — dpkg
# deletes package files afterwards — so -R can find it.
case "$1" in
  remove|purge)
    if command -v apparmor_parser >/dev/null 2>&1 && [ -f /etc/apparmor.d/rove ]; then
        apparmor_parser -R /etc/apparmor.d/rove 2>/dev/null || true
    fi
    ;;
esac

exit 0
