import { cva } from 'class-variance-authority'
import { StatusDot, usePresence } from '@/ui'
import { LEAVING, SCAN_EXIT_MS, STATUS_DOT } from '@/features/devices/utils/status-slot'

const onlineVariants = cva('whitespace-nowrap text-tertiary', {
  variants: {
    isLeaving: { true: LEAVING, false: 'animate-scan-slide-in' },
  },
})

// The online tally shares the scan status's slot and motion: it slides in from
// the left when a scan finishes (active turns true) and slides back out to the
// left when the next scan starts and the status takes the slot. Like ScanStatus
// it lingers mounted for SCAN_EXIT_MS so the slide-out can play rather than the
// count just vanishing.
export function OnlineIndicator({
  isActive,
  count,
}: {
  isActive: boolean
  count: number
}): JSX.Element | null {
  const isMounted = usePresence(isActive, SCAN_EXIT_MS)

  if (!isMounted) return null
  return (
    <span
      className={onlineVariants({ isLeaving: !isActive })}
      title="Responding to the last scan"
      aria-hidden={isActive ? undefined : true}
    >
      <StatusDot className={STATUS_DOT} />
      <span className="num text-secondary">{count}</span> online
    </span>
  )
}
