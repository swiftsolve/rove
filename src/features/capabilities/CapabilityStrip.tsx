import type { CapabilityId, CapabilityRating } from '@/types'
import { CAPABILITY_DEFINITIONS, CAPABILITY_LEVEL_LABELS } from '@/types'
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
import { cx } from '@/lib/cx'
import styles from './CapabilityStrip.module.css'

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
      <button
        type="button"
        className={cx('btn-icon', 'btn-icon-secondary', isTesting && 'is-scanning')}
        onClick={handleRunTest}
        disabled={!canRunTest || isTesting}
        aria-label={hasResults ? 'Run speed test again' : 'Run speed test'}
      >
        <RunButtonIcon isTesting={isTesting} hasResults={hasResults} />
      </button>
    </Tooltip>
  )
}

/** Every capability as a greyed-out tile, before any test has run. */
function PlaceholderStrip({ isTesting }: { isTesting: boolean }): JSX.Element {
  return (
    <>
      <div
        className={cx(styles.list, styles.isPlaceholder)}
        role="list"
        aria-hidden
      >
        {CAPABILITY_DEFINITIONS.map((capability) => (
          <div className={styles.cell} key={capability.id} role="listitem">
            <Tooltip content={capability.label} align="left" placement="top">
              <span className={cx(styles.item, styles.tile)} data-level="unsupported">
                <CapabilityIcon id={capability.id} size={16} />
              </span>
            </Tooltip>
            <CapabilityMeter level="unsupported" shouldShowLabel={false} isCompact isMuted />
          </div>
        ))}
      </div>

      <div className={cx(styles.footer, styles.isHint)}>
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
    <div className={styles.cell} role="listitem">
      <Tooltip
        content={<InlineMeta items={[capability.label, levelLabel]} />}
        align="left"
        placement="top"
        offset={4}
        isDisabled={isTesting}
      >
        <button
          type="button"
          className={cx(styles.item, styles.tile)}
          data-level={capability.level}
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
    </div>
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
      <div className={styles.footer}>
        <span className="text-meta">Testing…</span>
      </div>
    )
  }

  if (completedAt == null) return null

  return (
    <div className={styles.footer}>
      <button
        type="button"
        className={styles.link}
        onClick={() => navigate({ tab: 'speed' })}
        aria-label="Go to speed test"
      >
        <HistoryIcon size={13} />
        <span className={styles.updated}>
          Updated {formatTimeAgo(completedAt, now)}
        </span>
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
          <div className={cx(styles.list, isTesting && styles.isTesting)} role="list">
            {capabilities.map((capability) => (
              <ResultCell
                key={capability.id}
                capability={capability}
                isTesting={isTesting}
                onOpenDetails={openDetails}
              />
            ))}
          </div>

          <ResultFooter isTesting={isTesting} />
        </>
      )}
    </Section>
  )
}
