import { cva } from 'class-variance-authority'
import type { JSX } from 'react'

import { reachabilityStatus } from '@/features/services/utils/service-status'
import { type InternetStatus, isInternetDown, type ServiceReachability } from '@/types'
import { ArrowDownIcon, ArrowUpIcon, DotSeparator, STATUS_TEXT } from '@/ui'

// Inherits the header subtitle's size and colour. Wraps between the two halves
// rather than squeezing either: below ~390px of header width both don't fit.
const ROOT = 'inline-flex flex-wrap items-center gap-x-6 gap-y-2'

// Flex centring aligns the arrow to the line box, which reserves descender room
// the labels never use, so the arrow reads a hair low: 1px up centres it on the
// cap height (measured against Inter at 11px). The arrow's ink starts ~3px into
// its box, so -3px lets spacing be set by the ink, like a text label's.
const ICON = 'ml-[-3px] shrink-0 translate-y-[-1px]'

// `nowrap` because as a flex item the text shrinks to min-content, which would
// break "5 Up" across two lines.
const halfVariants = cva('inline-flex items-center gap-[3px] whitespace-nowrap', {
  variants: {
    /** The half's text (and arrow) colour: green for up, red for any down. */
    status: { positive: STATUS_TEXT.positive, negative: STATUS_TEXT.negative },
  },
})

/**
 * The live up/down count for the Services and Services Timeline headers, as a
 * status live region so a service going down is announced. A plain function, not
 * a component, so it can return `null` when there's nothing to count and each
 * caller picks its own fallback.
 */
export function serviceTally(
  reachability: ServiceReachability[] | undefined,
  internet: InternetStatus | undefined,
): JSX.Element | null {
  // Offline, every probe fails at once, and a "6 Down" tally would blame the
  // services for our own outage. Say so in the title bar's words instead.
  if (isInternetDown(internet)) {
    return (
      <span className={ROOT} role="status">
        <span className="text-negative">No internet</span>
      </span>
    )
  }

  const probes = reachability ?? []
  if (probes.length === 0) return null
  const upCount = probes.filter((svc) => reachabilityStatus(svc) === 'up').length
  const downCount = probes.length - upCount

  return (
    <span className={ROOT} role="status">
      <span className={halfVariants({ status: 'positive' })}>
        <ArrowUpIcon size={13} className={ICON} />
        {upCount} Up
      </span>
      <DotSeparator />
      <span className={halfVariants({ status: downCount > 0 ? 'negative' : undefined })}>
        <ArrowDownIcon size={13} className={ICON} />
        {downCount} Down
      </span>
    </span>
  )
}
