import { useEffect, useRef } from 'react'
import type { CapabilityId, CapabilityLevel, CapabilityRating, SpeedResult } from '@/types'
import { CAPABILITY_LEVEL_LABELS } from '@/types'
import { explainCapability } from '@/components/capabilities/capability-detail'
import CapabilityIcon from '@/components/capabilities/CapabilityIcon'
import CapabilityMeter from '@/components/capabilities/CapabilityMeter'
import Subpage from '@/components/ui/Subpage'
import { AlertIcon, CheckIcon, CloseIcon } from '@/components/ui/Icons'
import { formatTimeAgo, TIME_AGO_RESOLUTION_MS } from '@/lib/format'
import { useNow } from '@/hooks/useNow'
import { flashHighlight } from '@/lib/highlight'
import './CapabilityDetails.css'

/** The verdict glyph: a tick when the connection clears the bar, a warning when
 *  it only just scrapes by, a cross when it falls short. */
function VerdictIcon({ level }: { readonly level: CapabilityLevel }): JSX.Element {
  if (level === 'excellent' || level === 'good') return <CheckIcon size={14} />
  if (level === 'fair') return <AlertIcon size={13} />
  return <CloseIcon size={14} />
}

interface CapabilityDetailsProps {
  readonly capabilities: readonly CapabilityRating[]
  readonly speed: SpeedResult
  readonly completedAt: number | null
  /** Capability to scroll into view when the page opens (the one just clicked). */
  readonly targetId?: CapabilityId | null
  readonly onBack: () => void
}

function CapabilityDetailCard({
  capability,
  speed,
}: {
  readonly capability: CapabilityRating
  readonly speed: SpeedResult
}): JSX.Element {
  const { summary, checks } = explainCapability(capability.id, capability.level, speed)

  return (
    <section className="cap-detail surface" data-capability-id={capability.id}>
      <header className="cap-detail-head">
        <span className={`cap-detail-icon level-${capability.level}`}>
          <CapabilityIcon id={capability.id} size={16} />
        </span>
        <div className="cap-detail-headtext">
          <span className="cap-detail-name">{capability.label}</span>
          <span className="cap-detail-desc">{capability.description}</span>
        </div>
        <CapabilityMeter level={capability.level} showLabel={false} />
      </header>

      <div className="cap-metrics">
        {checks.map((check) => (
          <div key={check.label} className={`cap-metric ${check.pass ? 'pass' : 'fail'}`}>
            <span className="field-label">{check.label}</span>
            <span className="cap-metric-value num">{check.have}</span>
            <span className="cap-metric-need">{check.need}</span>
          </div>
        ))}
      </div>

      <div className="cap-detail-verdict">
        <p className="cap-detail-summary">
          <span className={`cap-verdict-icon level-${capability.level}`} aria-hidden>
            <VerdictIcon level={capability.level} />
          </span>
          <span>{summary}</span>
        </p>
        <span className={`cap-verdict-status level-${capability.level}`}>
          <span className="cap-verdict-dot" aria-hidden />
          {CAPABILITY_LEVEL_LABELS[capability.level]}
        </span>
      </div>
    </section>
  )
}

export default function CapabilityDetails({
  capabilities,
  speed,
  completedAt,
  targetId,
  onBack,
}: CapabilityDetailsProps): JSX.Element {
  const now = useNow(TIME_AGO_RESOLUTION_MS)
  const listRef = useRef<HTMLDivElement>(null)

  // Smooth-scroll to the capability the user clicked. Runs once on open; the
  // target card sits below the page header, so scroll it to the top of the
  // viewport (its scroll-margin leaves a little breathing room). Deferred to the
  // next frame so the subpage has laid out before the scroll animates.
  //
  // We scroll the app's own `.app-scroll` container directly rather than calling
  // card.scrollIntoView(): scrollIntoView walks up and scrolls *every* scrollable
  // ancestor, which across an iframe boundary reaches the host document — so on
  // the marketing-site demo it would drag the whole landing page down with it.
  //
  // Deferred two frames: opening the subpage changes the app's screen key, whose
  // effect resets `.app-scroll` back to the top. Running a frame later than that
  // reset lets our smooth scroll animate cleanly from the top to the target card.
  useEffect(() => {
    if (targetId == null) return
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        const card = listRef.current?.querySelector<HTMLElement>(
          `[data-capability-id="${targetId}"]`,
        )
        const scroller = card?.closest<HTMLElement>('.app-scroll')
        if (!card || !scroller) return
        const margin = parseFloat(getComputedStyle(card).scrollMarginTop) || 0
        const delta = card.getBoundingClientRect().top - scroller.getBoundingClientRect().top
        scroller.scrollTo({ top: scroller.scrollTop + delta - margin, behavior: 'smooth' })
        flashHighlight(card)
      })
    })
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
    }
  }, [targetId])

  return (
    <Subpage
      title="Capabilities"
      description={
        completedAt != null ? `Updated ${formatTimeAgo(completedAt, now)}` : undefined
      }
      onBack={onBack}
    >
      <div className="cap-detail-list" ref={listRef}>
        {capabilities.map((capability) => (
          <CapabilityDetailCard key={capability.id} capability={capability} speed={speed} />
        ))}
      </div>
    </Subpage>
  )
}
