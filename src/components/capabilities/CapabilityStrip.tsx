import type { CapabilityRating } from '@/types'
import { CAPABILITY_LEVEL_LABELS } from '@/types'
import CapabilityIcon from '@/components/capabilities/CapabilityIcon'
import Section from '@/components/ui/Section'
import { InlineMeta } from '@/components/ui/DotSeparator'
import { Tooltip } from '@/components/ui/Tooltip'
import { PlayIcon, ZapIcon } from '@/components/ui/Icons'
import './CapabilityStrip.css'

interface CapabilityStripProps {
  readonly capabilities: readonly CapabilityRating[]
  readonly canRunTest: boolean
  /** A speed test is currently running (started here or from the Speed tab). */
  readonly testing: boolean
  readonly onOpenDetails: () => void
  readonly onRunTest: () => void
}

export default function CapabilityStrip({
  capabilities,
  canRunTest,
  testing,
  onOpenDetails,
  onRunTest,
}: CapabilityStripProps): JSX.Element {
  return (
    <Section
      title="Capabilities"
      icon={<ZapIcon size={15} />}
      className="capability-strip-section"
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
        <div className="capability-strip" role="list">
          {capabilities.map((capability) => (
            <Tooltip
              key={capability.id}
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
                onClick={onOpenDetails}
                aria-label={`${capability.label}: ${CAPABILITY_LEVEL_LABELS[capability.level]}`}
                role="listitem"
              >
                <CapabilityIcon id={capability.id} size={16} />
              </button>
            </Tooltip>
          ))}
        </div>
      )}
    </Section>
  )
}
