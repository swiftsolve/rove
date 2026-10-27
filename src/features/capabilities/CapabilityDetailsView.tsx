import { useEffect, useRef } from 'react'
import type { CapabilityId, CapabilityLevel, CapabilityRating, SpeedResult } from '@/types'
import { CAPABILITY_LEVEL_LABELS } from '@/types'
import { useNavigation } from '@/app/hooks/useNavigation'
import { useSpeedTest } from '@/features/speed/hooks/useSpeedTest'
import { explainCapability } from '@/features/capabilities/utils/capability-detail'
import { CapabilityIcon } from '@/features/capabilities/CapabilityIcon'
import { CapabilityMeter } from '@/features/capabilities/CapabilityMeter'
import { Subpage } from '@/components/Subpage'
import { AlertIcon, CheckIcon, CloseIcon } from '@/components/icons/Icons'
import { formatTimeAgo, TIME_AGO_RESOLUTION_MS } from '@/lib/format'
import { useNow } from '@/hooks/useNow'
import { flashHighlight } from '@/lib/highlight'
import { cx } from '@/lib/cx'
import styles from './CapabilityDetailsView.module.css'

interface CapabilityDetailsViewProps {
  /** Capability to scroll into view when the page opens (the one just clicked). */
  targetId?: CapabilityId | null
}

/**
 * Smooth-scroll a card to the top of the app's scroll container
 * (`[data-scroll-root]`; its scroll-margin leaves a little breathing room),
 * then flash it.
 *
 * We scroll the container directly rather than calling card.scrollIntoView():
 * scrollIntoView walks up and scrolls *every* scrollable ancestor, which across
 * an iframe boundary reaches the host document — so on the marketing-site demo
 * it would drag the whole landing page down with it.
 */
function scrollCardToTop(card: HTMLElement): void {
  const scroller = card.closest<HTMLElement>('[data-scroll-root]')
  if (!scroller) return
  const margin = parseFloat(getComputedStyle(card).scrollMarginTop) || 0
  const offset = card.getBoundingClientRect().top - scroller.getBoundingClientRect().top
  scroller.scrollTo({ top: scroller.scrollTop + offset - margin, behavior: 'smooth' })
  flashHighlight(card)
}

/** The verdict glyph: a tick when the connection clears the bar, a warning when
 *  it only just scrapes by, a cross when it falls short. */
function VerdictIcon({ level }: { level: CapabilityLevel }): JSX.Element {
  if (level === 'excellent' || level === 'good') return <CheckIcon size={14} />
  if (level === 'fair') return <AlertIcon size={13} />
  return <CloseIcon size={14} />
}

function CapabilityDetailCard({
  capability,
  speed,
}: {
  capability: CapabilityRating
  speed: SpeedResult
}): JSX.Element {
  const { summary, checks } = explainCapability(capability.id, capability.level, speed)

  return (
    <section className={cx(styles.card, 'surface')} data-capability-id={capability.id}>
      <header className={styles.head}>
        <span className={styles.icon} data-level={capability.level}>
          <CapabilityIcon id={capability.id} size={16} />
        </span>
        <div className={styles.headText}>
          <span className={styles.name}>{capability.label}</span>
          <span className={styles.desc}>{capability.description}</span>
        </div>
        <CapabilityMeter
          level={capability.level}
          shouldShowLabel={false}
          barsClassName={styles.meterBars}
        />
      </header>

      <div className={styles.metrics}>
        {checks.map((check) => (
          <div key={check.label} className={cx(styles.metric, !check.isMet && styles.isUnmet)}>
            <span className="field-label">{check.label}</span>
            <span className={cx(styles.metricValue, 'num')}>{check.have}</span>
            <span className={styles.metricNeed}>{check.need}</span>
          </div>
        ))}
      </div>

      <div className={styles.verdict}>
        <p className={styles.summary}>
          <span className={styles.verdictIcon} data-level={capability.level} aria-hidden>
            <VerdictIcon level={capability.level} />
          </span>
          <span>{summary}</span>
        </p>
        <span className={styles.verdictStatus} data-level={capability.level}>
          <span className={styles.verdictDot} aria-hidden />
          {CAPABILITY_LEVEL_LABELS[capability.level]}
        </span>
      </div>
    </section>
  )
}

export function CapabilityDetailsView({ targetId }: CapabilityDetailsViewProps): JSX.Element {
  const { back } = useNavigation()
  const { capabilities, internetSpeed: speed, completedAt } = useSpeedTest()
  const now = useNow(TIME_AGO_RESOLUTION_MS)
  const listRef = useRef<HTMLDivElement>(null)

  // Scroll to the capability the user clicked, once on open. Deferred two
  // frames: opening the subpage changes the app's screen key, whose effect
  // resets the scroll container back to the top. Running a frame later than
  // that reset lets our smooth scroll animate cleanly from the top to the target card.
  useEffect(() => {
    if (targetId == null) return
    let innerFrame = 0
    const outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
        const card = listRef.current?.querySelector<HTMLElement>(
          `[data-capability-id="${targetId}"]`,
        )
        if (card) scrollCardToTop(card)
      })
    })
    return () => {
      cancelAnimationFrame(outerFrame)
      cancelAnimationFrame(innerFrame)
    }
  }, [targetId])

  return (
    <Subpage
      title="Capabilities"
      description={
        completedAt != null ? `Updated ${formatTimeAgo(completedAt, now)}` : undefined
      }
      onBack={back}
    >
      <div className={styles.list} ref={listRef}>
        {/* The Speed view only opens this page once a result is in. */}
        {speed != null &&
          capabilities.map((capability) => (
            <CapabilityDetailCard key={capability.id} capability={capability} speed={speed} />
          ))}
      </div>
    </Subpage>
  )
}
