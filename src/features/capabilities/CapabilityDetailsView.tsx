import { useEffect, useRef } from 'react'
import { cva, cx } from 'class-variance-authority'
import type { CapabilityId, CapabilityLevel, CapabilityRating, SpeedResult } from '@/types'
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
import { CAPABILITY_LEVEL_LABELS } from '@/features/capabilities/utils/capability-level-labels'
import styles from './CapabilityDetailsView.module.css'

const iconVariants = cva(styles.icon, {
  variants: {
    level: {
      excellent: styles.levelExcellent,
      good: styles.levelGood,
      fair: styles.levelFair,
      poor: styles.levelPoor,
      unsupported: styles.levelUnsupported,
    },
  },
})

const metricVariants = cva(styles.metric, {
  variants: {
    isUnmet: { true: styles.isUnmet },
  },
})

const verdictIconVariants = cva(styles.verdictIcon, {
  variants: {
    level: {
      excellent: styles.levelExcellent,
      good: styles.levelGood,
      fair: styles.levelFair,
      poor: styles.levelPoor,
      unsupported: styles.levelUnsupported,
    },
  },
})

const verdictStatusVariants = cva(styles.verdictStatus, {
  variants: {
    level: {
      excellent: styles.levelExcellent,
      good: styles.levelGood,
      fair: styles.levelFair,
      poor: styles.levelPoor,
      unsupported: styles.levelUnsupported,
    },
  },
})

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
    <li className={cx(styles.card, 'surface')} data-capability-id={capability.id}>
      <div className={styles.head}>
        <span className={iconVariants({ level: capability.level })}>
          <CapabilityIcon id={capability.id} size={16} />
        </span>
        <div className={styles.headText}>
          <h2 className={styles.name}>{capability.label}</h2>
          <span className={styles.desc}>{capability.description}</span>
        </div>
        <CapabilityMeter
          level={capability.level}
          shouldShowLabel={false}
          barsClassName={styles.meterBars}
        />
      </div>

      <dl className={styles.metrics}>
        {checks.map((check) => (
          <div key={check.label} className={metricVariants({ isUnmet: !check.isMet })}>
            <dt className="field-label">{check.label}</dt>
            <dd className={cx(styles.metricValue, 'num')}>{check.have}</dd>
            <dd className={styles.metricNeed}>
              <span className="sr-only">Needs </span>
              {check.need}
            </dd>
          </div>
        ))}
      </dl>

      <div className={styles.verdict}>
        <p className={styles.summary}>
          <span className={verdictIconVariants({ level: capability.level })} aria-hidden>
            <VerdictIcon level={capability.level} />
          </span>
          <span>{summary}</span>
        </p>
        <span className={verdictStatusVariants({ level: capability.level })}>
          <span className={styles.verdictDot} aria-hidden />
          {CAPABILITY_LEVEL_LABELS[capability.level]}
        </span>
      </div>
    </li>
  )
}

export function CapabilityDetailsView({ targetId }: CapabilityDetailsViewProps): JSX.Element {
  const { back } = useNavigation()
  const { capabilities, internetSpeed: speed, completedAt } = useSpeedTest()
  const now = useNow(TIME_AGO_RESOLUTION_MS)
  const listRef = useRef<HTMLUListElement>(null)

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
        completedAt != null ? (
          <>
            Updated{' '}
            <time dateTime={new Date(completedAt).toISOString()}>
              {formatTimeAgo(completedAt, now)}
            </time>
          </>
        ) : undefined
      }
      onBack={back}
    >
      <ul role="list" className={styles.list} ref={listRef}>
        {/* The Speed view only opens this page once a result is in. */}
        {speed != null &&
          capabilities.map((capability) => (
            <CapabilityDetailCard key={capability.id} capability={capability} speed={speed} />
          ))}
      </ul>
    </Subpage>
  )
}
