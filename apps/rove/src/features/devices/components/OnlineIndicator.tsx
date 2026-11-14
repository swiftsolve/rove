import { StatusDot, usePresence } from '@swiftsolve/rove-ui'
import { cva } from 'class-variance-authority'
import type { JSX } from 'react'

import { LEAVING_OVERLAY, SCAN_EXIT_MS, STATUS_DOT } from '@/features/devices/utils/status-slot'

const onlineVariants = cva('whitespace-nowrap text-tertiary', {
  variants: {
    isLeaving: { true: LEAVING_OVERLAY, false: 'animate-scan-slide-in' },
  },
  defaultVariants: { isLeaving: false },
})

/**
 * The header's "N online" tally. Shares ScanStatus's slot and motion, and like
 * it stays mounted for SCAN_EXIT_MS so the slide-out can play.
 */
export function OnlineIndicator({ isActive, count }: { isActive: boolean; count: number }): JSX.Element | null {
  const isMounted = usePresence(isActive, SCAN_EXIT_MS)

  if (!isMounted) return null
  return (
    <span className={onlineVariants({ isLeaving: !isActive })} aria-hidden={isActive ? undefined : true}>
      <StatusDot tone="positive" className={STATUS_DOT} />
      <span className="num text-secondary">{count}</span> online
    </span>
  )
}
