import { useMutation } from '@tanstack/react-query'
import type { JSX } from 'react'

import { getNetworkApi } from '@/bridge/network-api'
import { isTauri } from '@/bridge/tauri-network-api'
import { useUsageSupportDetail } from '@/features/apps/hooks/useUsageSupportDetail'
import { IS_WINDOWS } from '@/lib/platform'
import { Button, EmptyStateDescription } from '@/ui'

/**
 * Relaunches Rove as administrator for the per-app usage views, whose ETW session
 * only opens with elevation on Windows. On success the backend exits this
 * instance and the elevated one takes over. Renders nothing off Windows or in the
 * browser, where there's nothing to elevate.
 */
export function RestartAsAdminAction(): JSX.Element | null {
  // On success the backend exits this process, so only a declined prompt settles it.
  const relaunch = useMutation({ mutationFn: () => getNetworkApi().relaunchAsAdmin() })
  const isBusy = relaunch.isPending
  const wasDeclined = relaunch.isError

  const isEnabled = IS_WINDOWS && isTauri()
  // So a failure that isn't about elevation (a policy block, a provider error)
  // isn't blamed on it.
  const detail = useUsageSupportDetail(isEnabled)

  if (!isEnabled) return null

  return (
    <>
      <Button onClick={() => relaunch.mutate()} isLoading={isBusy}>
        {isBusy ? 'Waiting for confirmation…' : 'Restart as administrator'}
      </Button>
      {/* Always mounted, so the note is announced when it appears. */}
      <EmptyStateDescription role="status" className="empty:hidden">
        {wasDeclined ? 'Elevation was declined.' : null}
      </EmptyStateDescription>
      {detail && <EmptyStateDescription>Details: {detail}</EmptyStateDescription>}
    </>
  )
}
