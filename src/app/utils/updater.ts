import { relaunch } from '@tauri-apps/plugin-process'
import { check } from '@tauri-apps/plugin-updater'

import { isTauri } from '@/bridge/tauri-network-api'

/**
 * A newer signed release that has been found but not yet installed. The UI
 * presents it to the user and calls `install()` if they accept.
 */
export type PendingUpdate = {
  version: string
  currentVersion: string
  notes: string
  /** Download and install the update, then relaunch into the new build. */
  install(): Promise<void>
}

/**
 * Check GitHub Releases for a newer signed build, or null if there's nothing to
 * install. Packages are verified against the public key in tauri.conf.json.
 * A failed check rejects: the launch check ignores it, while one the user
 * asked for says it failed rather than "up to date".
 */
export async function checkForUpdates(): Promise<PendingUpdate | null> {
  // The browser builds (dev server, the site's demo) have nothing to update.
  if (!isTauri()) return null
  const update = await check()
  if (!update) return null

  return {
    version: update.version,
    currentVersion: update.currentVersion,
    notes: update.body ?? '',
    async install() {
      await update.downloadAndInstall()
      await relaunch()
    },
  }
}
