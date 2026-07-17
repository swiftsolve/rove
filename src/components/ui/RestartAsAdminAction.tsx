import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { IS_WINDOWS } from '@/lib/platform'
import { isTauri } from '@/bridge/tauriNetworkApi'

/**
 * The "needs administrator" control for the per-app usage views (Apps, Hosts,
 * Traffic Types). Those all read from an ETW session that only opens with
 * elevation, so when the platform reports itself unsupported on Windows this
 * relaunches Rove as administrator — raising the UAC prompt. On success the
 * backend exits this instance and the elevated one takes over; if the prompt is
 * dismissed we surface a short note and stay put.
 *
 * Renders nothing off Windows or outside the desktop app: elsewhere the views
 * are always supported, and there's no shell to elevate through in the browser.
 */
export function RestartAsAdminAction(): JSX.Element | null {
  const [busy, setBusy] = useState(false)
  const [declined, setDeclined] = useState(false)

  if (!IS_WINDOWS || !isTauri()) return null

  const onClick = async (): Promise<void> => {
    setBusy(true)
    setDeclined(false)
    try {
      await invoke('relaunch_as_admin')
      // On success the backend exits this process; nothing more to do.
    } catch {
      setDeclined(true)
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" className="btn-secondary" onClick={onClick} disabled={busy}>
        {busy ? 'Waiting for confirmation…' : 'Restart as administrator'}
      </button>
      {declined && (
        <p className="empty-state-hint">
          Elevation was declined — per-app usage stays off until Rove runs as administrator.
        </p>
      )}
    </>
  )
}
