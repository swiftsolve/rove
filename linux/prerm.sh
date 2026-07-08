#!/bin/sh
# Nothing to undo before removal: the file capability granted in postinst lives
# on the binary itself and is dropped when the package manager deletes it. This
# script exists only because the bundle config references it.
exit 0
