import type { InternetStatus, ServiceReachability } from '@/types'
import { DotSeparator } from '@/components/ui/DotSeparator'
import { ArrowDownIcon, ArrowUpIcon } from '@/components/ui/Icons'
import { reachabilityStatus } from '@/lib/serviceStatus'
import './ServiceTally.css'

/**
 * The live up/down count over the tracked services (e.g. "5 Up · 1 Down"), for
 * the Services and Services Timeline headers. Returns `null` when there's
 * nothing to count yet, so each caller picks its own fallback — hence a plain
 * function rather than a component, which would always render truthy.
 */
export function serviceTally(
  reachability: readonly ServiceReachability[] | undefined,
  internet: InternetStatus | undefined,
): JSX.Element | null {
  // With the machine itself offline, every probe fails at once — a "6 down" tally
  // would blame the services for our own outage. Surface the real cause instead,
  // matching the "connection lost" event the timeline records for this window.
  if (internet === 'noInternet' || internet === 'offline') {
    return (
      <span className="svctally">
        <span className="val-bad">Network connection lost</span>
      </span>
    )
  }

  const probes = reachability ?? []
  if (probes.length === 0) return null
  const upCount = probes.filter((svc) => reachabilityStatus(svc) === 'up').length
  const downCount = probes.length - upCount

  return (
    <span className="svctally">
      <span className="svctally-half val-good">
        <ArrowUpIcon size={13} className="svctally-icon" />
        {upCount} Up
      </span>
      <DotSeparator />
      <span className={`svctally-half ${downCount > 0 ? 'val-bad' : ''}`}>
        <ArrowDownIcon size={13} className="svctally-icon" />
        {downCount} Down
      </span>
    </span>
  )
}
