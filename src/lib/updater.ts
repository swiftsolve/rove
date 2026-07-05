import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

/**
 * A newer signed release that has been found but not yet installed. The UI
 * presents it to the user and calls `install()` if they accept.
 */
export interface PendingUpdate {
  readonly version: string
  readonly currentVersion: string
  readonly notes: string
  /** Download + install the update, then relaunch into the new build. */
  install(): Promise<void>
}

/**
 * Check GitHub Releases for a newer signed build. Returns a descriptor the UI
 * can present, or null if there's nothing to install. The updater verifies
 * every package against the public key embedded in tauri.conf.json, so a
 * tampered or unsigned build is rejected before it can run.
 *
 * Silent by design: any failure (offline, no release yet, endpoint 404) is
 * swallowed and reported as null so a failed check never disrupts a launch.
 *
 * Note: prompting is intentionally left to the caller via a React modal rather
 * than window.confirm — native JS dialogs block the GTK main loop and freeze
 * the entire webview on Linux/WebKitGTK.
 */
export async function checkForUpdates(): Promise<PendingUpdate | null> {
  try {
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
  } catch (err) {
    console.warn('Update check failed:', err)
    return null
  }
}
