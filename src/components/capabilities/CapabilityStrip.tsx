import type { CapabilityId, CapabilityRating } from '@/types'
import { CAPABILITY_LEVEL_LABELS } from '@/types'
import CapabilityIcon from '@/components/capabilities/CapabilityIcon'
import CapabilityMeter from '@/components/capabilities/CapabilityMeter'
import Section from '@/components/ui/Section'
import { InlineMeta } from '@/components/ui/DotSeparator'
import { Tooltip } from '@/components/ui/Tooltip'
import { HistoryIcon, PlayIcon, RefreshIcon, ZapIcon } from '@/components/ui/Icons'
import { formatTimeAgo } from '@/lib/format'
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
  const hasResults = capabilities.length > 0

  return (
    <Section
      title="Capabilities"
      icon={<ZapIcon size={15} />}
      className="capability-strip-section"
      action={
        hasResults ? (
          <Tooltip content={testing ? 'Speed test running' : 'Run speed test again'}>
            <button
              type="button"
              className="btn-icon btn-icon-secondary"
              onClick={onRunTest}
              disabled={!canRunTest || testing}
              aria-label="Run speed test again"
            >
              <RefreshIcon size={14} className={testing ? 'capability-rerun-spin' : undefined} />
            </button>
          </Tooltip>
        ) : undefined
      }
    >
      {capabilities.length === 0 ? (
        <div className="section-placeholder">
          <ZapIcon size={24} className="section-placeholder-icon" />
          <p className="text-hint">
            Run a speed test to see what your connection can handle.
          </p>
          <button
            type="button"
            className="btn-primary capability-run-btn"
            onClick={onRunTest}
            disabled={!canRunTest || testing}
          >
            <PlayIcon size={13} />
            {testing ? 'Running…' : 'Run speed test'}
          </button>
        </div>
      ) : (
        <>
          <div className="capability-strip" role="list">
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
                >
                  <button
                    type="button"
                    className={`capability-strip-item capability-icon-tile level-${capability.level}`}
                    onClick={() => onOpenDetails(capability.id)}
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
                  Updated {formatTimeAgo(completedAt)}
                </span>
              </button>
            </div>
          ) : null}
        </>
      )}
    </Section>
  )
}
