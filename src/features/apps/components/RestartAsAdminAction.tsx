import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { IS_WINDOWS } from '@/lib/platform'
import { isTauri } from '@/bridge/tauri-network-api'
import { EmptyStateDescription } from '@/components/EmptyState'
import { Button } from '@/components/Button'

/**
 * The "needs administrator" control for the per-app usage views (Apps, Hosts,
 * Traffic Types). Those all read from an ETW session that only opens with
 * elevation, so when the platform reports itself unsupported on Windows this
 * relaunches Rove as administrator, raising the UAC prompt. On success the
 * backend exits this instance and the elevated one takes over; if the prompt is
 * dismissed we surface a short note and stay put.
 *
 * When the session fails to open for a reason other than elevation, the backend
 * reports the underlying error; we show it here so the cause is visible instead
 * of only ever blaming elevation.
 *
 * Renders nothing off Windows or outside the desktop app: elsewhere the views
 * are always supported, and there's no shell to elevate through in the browser.
 */
export function RestartAsAdminAction(): JSX.Element | null {
  const [isBusy, setIsBusy] = useState(false)
  const [wasDeclined, setWasDeclined] = useState(false)
  const [detail, setDetail] = useState<string | null>(null)

  const isEnabled = IS_WINDOWS && isTauri()

  // Pull the real reason the session won't open, so a failure that isn't about
  // elevation (a policy block, a provider error) is visible rather than hidden.
  useEffect(() => {
    if (!isEnabled) return
    let isAlive = true
    void invoke<string | null>('usage_support_detail')
      .then((reason) => isAlive && setDetail(reason))
      .catch(() => isAlive && setDetail(null))
    return () => {
      isAlive = false
    }
  }, [isEnabled])

  if (!isEnabled) return null

  const relaunchAsAdmin = async (): Promise<void> => {
    setIsBusy(true)
    setWasDeclined(false)
    try {
      await invoke('relaunch_as_admin')
      // On success the backend exits this process; nothing more to do.
    } catch {
      setWasDeclined(true)
      setIsBusy(false)
    }
  }

  return (
    <>
      <Button onClick={relaunchAsAdmin} isLoading={isBusy}>
        {isBusy ? 'Waiting for confirmation…' : 'Restart as administrator'}
      </Button>
      {wasDeclined && <EmptyStateDescription role="status">Elevation was declined.</EmptyStateDescription>}
      {detail && <EmptyStateDescription>Details: {detail}</EmptyStateDescription>}
    </>
  )
}
