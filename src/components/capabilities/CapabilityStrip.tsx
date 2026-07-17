import type { CapabilityId, CapabilityRating } from '@/types'
import { CAPABILITY_DEFINITIONS, CAPABILITY_LEVEL_LABELS } from '@/types'
import CapabilityIcon from '@/components/capabilities/CapabilityIcon'
import CapabilityMeter from '@/components/capabilities/CapabilityMeter'
import Section from '@/components/ui/Section'
import { ButtonSpinner } from '@/components/ui/ButtonSpinner'
import { InlineMeta } from '@/components/ui/DotSeparator'
import { Tooltip } from '@/components/ui/Tooltip'
import { HistoryIcon, PlayIcon, RefreshIcon, ZapIcon } from '@/components/ui/Icons'
import { formatTimeAgo, TIME_AGO_RESOLUTION_MS } from '@/lib/format'
import { useNow } from '@/hooks/useNow'
import './CapabilityStrip.css'

interface CapabilityStripProps {
  readonly capabilities: readonly CapabilityRating[]
  readonly canRunTest: boolean
  /** A speed test is currently running (started here or from the Speed tab). */
  readonly testing: boolean
  /** Epoch ms the last test finished — null until one completes. */
  readonly completedAt: number | null
  readonly onOpenDetails: (capabilityId: CapabilityId) => void
  readonly onRunTest: () => void
  /** Navigate to the Speed page. */
  readonly onOpenSpeed: () => void
}

export default function CapabilityStrip({
  capabilities,
  canRunTest,
  testing,
  completedAt,
  onOpenDetails,
  onRunTest,
  onOpenSpeed,
}: CapabilityStripProps): JSX.Element {
  const now = useNow(TIME_AGO_RESOLUTION_MS)
  const hasResults = capabilities.length > 0

  return (
    <Section
      title="Capabilities"
      icon={<ZapIcon size={15} />}
      className="capability-strip-section"
      action={
        <Tooltip
          content={
            testing
              ? 'Speed test running'
              : hasResults
                ? 'Run speed test again'
                : 'Run speed test'
          }
        >
          <button
            type="button"
            className={`btn-icon btn-icon-secondary${testing ? ' is-scanning' : ''}`}
            onClick={onRunTest}
            disabled={!canRunTest || testing}
            aria-label={hasResults ? 'Run speed test again' : 'Run speed test'}
          >
            {testing ? (
              <ButtonSpinner size={14} />
            ) : hasResults ? (
              <RefreshIcon size={14} />
            ) : (
              <PlayIcon size={14} />
            )}
          </button>
        </Tooltip>
      }
    >
      {capabilities.length === 0 ? (
        <>
          <div
            className="capability-strip capability-strip--placeholder"
            role="list"
            aria-hidden
          >
            {CAPABILITY_DEFINITIONS.map((capability) => (
              <div className="capability-strip-cell" key={capability.id} role="listitem">
                <Tooltip content={capability.label} align="left" placement="top">
                  <span className="capability-strip-item capability-icon-tile level-unsupported">
                    <CapabilityIcon id={capability.id} size={16} />
                  </span>
                </Tooltip>
                <CapabilityMeter level="unsupported" showLabel={false} />
              </div>
            ))}
          </div>

          <div className="capability-strip-footer capability-strip-footer--hint">
            {testing ? (
              <span className="text-meta">Testing…</span>
            ) : (
              <p className="text-hint capability-strip-hint">
                Available after speed test
              </p>
            )}
          </div>
        </>
      ) : (
        <>
          <div className={`capability-strip${testing ? ' capability-strip--testing' : ''}`} role="list">
            {capabilities.map((capability) => (
              <div className="capability-strip-cell" key={capability.id} role="listitem">
                <Tooltip
                  content={
                    <InlineMeta
                      items={[capability.label, CAPABILITY_LEVEL_LABELS[capability.level]]}
                    />
                  }
                  align="left"
                  placement="top"
                  offset={4}
                  disabled={testing}
                >
                  <button
                    type="button"
                    className={`capability-strip-item capability-icon-tile level-${capability.level}`}
                    onClick={() => onOpenDetails(capability.id)}
                    disabled={testing}
                    aria-label={`${capability.label}: ${CAPABILITY_LEVEL_LABELS[capability.level]}`}
                  >
                    <CapabilityIcon id={capability.id} size={16} />
                  </button>
                </Tooltip>
                <CapabilityMeter level={capability.level} showLabel={false} />
              </div>
            ))}
          </div>

          {testing ? (
            <div className="capability-strip-footer">
              <span className="text-meta">Testing…</span>
            </div>
          ) : completedAt != null ? (
            <div className="capability-strip-footer">
              <button
                type="button"
                className="capability-strip-link"
                onClick={onOpenSpeed}
                aria-label="Go to speed test"
              >
                <HistoryIcon size={13} />
                <span className="capability-strip-updated">
                  Updated {formatTimeAgo(completedAt, now)}
                </span>
              </button>
            </div>
          ) : null}
        </>
      )}
    </Section>
  )
}
