import { cva } from 'class-variance-authority'
import type { JSX } from 'react'

import { reachabilityStatus } from '@/features/services/utils/service-status'
import type { InternetStatus, ServiceReachability } from '@/types'
import { ArrowDownIcon, ArrowUpIcon, DotSeparator } from '@/ui'

// The header up/down tally, e.g. "5 Up · 1 Down": the dot is the shared
// InlineMeta separator. Sits in the header subtitle, so it inherits that line's
// caption size and tertiary colour. Wraps between the two halves rather than
// letting either be squeezed: below ~390px of header width there isn't room
// for both on one line.
const ROOT = 'inline-flex flex-wrap items-center gap-x-6 gap-y-2'

// Flex centring aligns the arrow to the text's *line box*, which reserves room
// for descenders the all-caps labels never use, so a geometrically centred
// icon reads a hair low and its tail dips under the baseline. Measured against
// Inter at 11px, the cap band is 98.3–106.3 and the arrow's ink 99.5–107.0, so
// 1px up puts the two midpoints together. The mirror of the lowercase case in
// SettingsView, which nudges the other way for the same reason.
// The -3px margin: the arrow's ink starts ~3px into its box; pulling that back
// lets the gap after a dot separator (and the first arrow's alignment under the
// title) be set by the ink, like a text label's.
const ICON = 'ml-[-3px] shrink-0 translate-y-[-1px]'

// Each half pairs its arrow with the count. The icon inherits the span's colour
// (green for up, red for down), matching the timeline markers. `nowrap` keeps
// the count and its label atomic: as a flex item the text shrinks to its
// min-content width, which would otherwise break "5 Up" across two lines.
const halfVariants = cva('inline-flex items-center gap-[3px] whitespace-nowrap', {
  variants: {
    /** The half's text (and arrow) colour: green for up, red for any down. */
    status: { positive: 'text-positive', negative: 'text-negative' },
  },
})

/**
 * The live up/down count over the tracked services (e.g. "5 Up · 1 Down"), for
 * the Services and Services Timeline headers. Returns `null` when there's
 * nothing to count yet, so each caller picks its own fallback — hence a plain
 * function rather than a component, which would always render truthy. A polite
 * live region, so a service going down is announced as the count changes.
 */
export function serviceTally(
  reachability: ServiceReachability[] | undefined,
  internet: InternetStatus | undefined,
): JSX.Element | null {
  // With the machine itself offline, every probe fails at once — a "6 down" tally
  // would blame the services for our own outage. Surface the real cause instead,
  // in the title bar's words. Callers pass the live status the title bar reads,
  // so the two always agree.
  if (internet === 'noInternet' || internet === 'offline') {
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
