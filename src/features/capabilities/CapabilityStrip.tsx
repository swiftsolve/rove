import { cva, cx } from 'class-variance-authority'
import type { CapabilityId, CapabilityRating } from '@/types'
import { CAPABILITY_DEFINITIONS } from '@/types'
import { useNavigation } from '@/app/hooks/useNavigation'
import { useSpeedTest } from '@/features/speed/hooks/useSpeedTest'
import { useCanRunSpeedTest } from '@/features/speed/hooks/useCanRunSpeedTest'
import { CapabilityIcon } from '@/features/capabilities/CapabilityIcon'
import { CapabilityMeter } from '@/features/capabilities/CapabilityMeter'
import { Section } from '@/components/Section'
import { ButtonSpinner } from '@/components/ButtonSpinner'
import { InlineMeta } from '@/components/DotSeparator'
import { Tooltip } from '@/components/Tooltip'
import { HistoryIcon, PlayIcon, RefreshIcon, ZapIcon } from '@/components/icons/Icons'
import { formatTimeAgo, TIME_AGO_RESOLUTION_MS } from '@/lib/format'
import { useNow } from '@/hooks/useNow'
import { IconButton } from '@/components/IconButton'
import { CAPABILITY_LEVEL_LABELS } from '@/features/capabilities/utils/capability-level-labels'
import styles from './CapabilityStrip.module.css'

const listVariants = cva(styles.list, {
  variants: {
    isTesting: { true: styles.isTesting },
    isPlaceholder: { true: styles.isPlaceholder },
  },
})

const tileVariants = cva([styles.item, styles.tile], {
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

const footerVariants = cva(styles.footer, {
  variants: {
    isHint: { true: styles.isHint },
  },
})

function runButtonTooltip(isTesting: boolean, hasResults: boolean): string {
  if (isTesting) return 'Speed test running'
  return hasResults ? 'Run speed test again' : 'Run speed test'
}

function RunButtonIcon({
  isTesting,
  hasResults,
}: {
  isTesting: boolean
  hasResults: boolean
}): JSX.Element {
  if (isTesting) return <ButtonSpinner size={14} />
  if (hasResults) return <RefreshIcon size={14} />
  return <PlayIcon size={14} />
}

/** Starts a test and jumps to the Speed tab so its progress is visible. */
function RunTestButton({
  isTesting,
  hasResults,
}: {
  isTesting: boolean
  hasResults: boolean
}): JSX.Element {
  const { navigate } = useNavigation()
  const { runTest } = useSpeedTest()
  const canRunTest = useCanRunSpeedTest()

  const handleRunTest = (): void => {
    navigate({ tab: 'speed' })
    void runTest()
  }

  return (
    <Tooltip placement="left" content={runButtonTooltip(isTesting, hasResults)}>
      <IconButton
        isBusy={isTesting}
        onClick={handleRunTest}
        isDisabled={!canRunTest || isTesting}
        aria-label={hasResults ? 'Run speed test again' : 'Run speed test'}
      >
        <RunButtonIcon isTesting={isTesting} hasResults={hasResults} />
      </IconButton>
    </Tooltip>
  )
}

/** Every capability as a greyed-out tile, before any test has run. */
function PlaceholderStrip({ isTesting }: { isTesting: boolean }): JSX.Element {
  return (
    <>
      <ul
        role="list"
        className={listVariants({ isPlaceholder: true })}
        aria-hidden
      >
        {CAPABILITY_DEFINITIONS.map((capability) => (
          <li className={styles.cell} key={capability.id}>
            <Tooltip content={capability.label} align="left" placement="top">
              <span className={tileVariants({ level: 'unsupported' })}>
                <CapabilityIcon id={capability.id} size={16} />
              </span>
            </Tooltip>
            <CapabilityMeter level="unsupported" shouldShowLabel={false} isCompact isMuted />
          </li>
        ))}
      </ul>

      <div className={footerVariants({ isHint: true })}>
        {isTesting ? (
          <span className="text-meta">Testing…</span>
        ) : (
          <p className={cx('text-hint', styles.hint)}>
            Available after speed test
          </p>
        )}
      </div>
    </>
  )
}

function ResultCell({
  capability,
  isTesting,
  onOpenDetails,
}: {
  capability: CapabilityRating
  isTesting: boolean
  onOpenDetails: (capabilityId: CapabilityId) => void
}): JSX.Element {
  const levelLabel = CAPABILITY_LEVEL_LABELS[capability.level]

  return (
    <li className={styles.cell}>
      <Tooltip
        content={<InlineMeta items={[capability.label, levelLabel]} />}
        align="left"
        placement="top"
        offset={4}
        isDisabled={isTesting}
      >
        <button
          type="button"
          className={tileVariants({ level: capability.level })}
          onClick={() => onOpenDetails(capability.id)}
          disabled={isTesting}
          aria-label={`${capability.label}: ${levelLabel}`}
        >
          <CapabilityIcon id={capability.id} size={16} />
        </button>
      </Tooltip>
      <CapabilityMeter
        level={capability.level}
        shouldShowLabel={false}
        isCompact
        isMuted={isTesting}
      />
    </li>
  )
}

/** "Testing…" while a test runs, otherwise when the last result landed (linking
 *  to the Speed page). Nothing before the first result. */
function ResultFooter({ isTesting }: { isTesting: boolean }): JSX.Element | null {
  const now = useNow(TIME_AGO_RESOLUTION_MS)
  const { navigate } = useNavigation()
  const { completedAt } = useSpeedTest()

  if (isTesting) {
    return (
      <div className={footerVariants()}>
        <span className="text-meta">Testing…</span>
      </div>
    )
  }

  if (completedAt == null) return null

  return (
    <div className={footerVariants()}>
      <button
        type="button"
        className={styles.link}
        onClick={() => navigate({ tab: 'speed' })}
      >
        <HistoryIcon size={13} />
        <span className={styles.updated}>
          Updated{' '}
          <time dateTime={new Date(completedAt).toISOString()}>{formatTimeAgo(completedAt, now)}</time>
        </span>
        {/* The visible text leads the name; this says where the link goes. */}
        <span className="sr-only">, open Speed</span>
      </button>
    </div>
  )
}

export function CapabilityStrip(): JSX.Element {
  const { navigate } = useNavigation()
  // A test can be started here or from the Speed tab; either way it greys the strip.
  const { capabilities, isTesting } = useSpeedTest()
  const hasResults = capabilities.length > 0

  const openDetails = (capabilityId: CapabilityId): void => {
    navigate({ tab: 'speed', speedSub: { view: 'details', target: capabilityId } })
  }

  return (
    <Section
      title="Capabilities"
      icon={<ZapIcon size={15} />}
      className={styles.section}
      action={
        <RunTestButton isTesting={isTesting} hasResults={hasResults} />
      }
    >
      {!hasResults ? (
        <PlaceholderStrip isTesting={isTesting} />
      ) : (
        <>
          <ul role="list" className={listVariants({ isTesting })}>
            {capabilities.map((capability) => (
              <ResultCell
                key={capability.id}
                capability={capability}
                isTesting={isTesting}
                onOpenDetails={openDetails}
              />
            ))}
          </ul>

          <ResultFooter isTesting={isTesting} />
        </>
      )}
    </Section>
  )
}
