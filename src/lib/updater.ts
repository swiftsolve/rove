import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

/**
 * Check GitHub Releases for a newer signed build and, if the user agrees,
 * download + install it and relaunch. The updater verifies every package
 * against the public key embedded in tauri.conf.json, so a tampered or
 * unsigned build is rejected before it can run.
 *
 * Silent by design: any failure (offline, no release yet, endpoint 404)
 * is swallowed so a failed check never disrupts a normal launch.
 */
export async function checkForUpdates(): Promise<void> {
  try {
    const update = await check()
    if (!update) return

    const accepted = window.confirm(
      `Beacon ${update.version} is available (you have ${update.currentVersion}).\n\n` +
        `${update.body ?? ''}\n\nDownload and install now?`,
    )
    if (!accepted) return

    await update.downloadAndInstall()
    await relaunch()
  } catch (err) {
    console.warn('Update check failed:', err)
  }
}
