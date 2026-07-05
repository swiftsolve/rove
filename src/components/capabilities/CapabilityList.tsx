import type { CapabilityRating } from '@/types'
import CapabilityIcon from '@/components/capabilities/CapabilityIcon'
import CapabilityMeter from '@/components/capabilities/CapabilityMeter'
import Section from '@/components/ui/Section'
import { ChevronRightIcon, PlayIcon, ZapIcon } from '@/components/ui/Icons'
import './CapabilityList.css'

interface CapabilityListProps {
  readonly capabilities: readonly CapabilityRating[]
  readonly hasRunTest: boolean
  readonly canRunTest: boolean
  readonly onOpenDetails: () => void
  readonly onRunTest: () => void
}

function CapabilityRow({
  capability,
  onOpen,
}: {
  readonly capability: CapabilityRating
  readonly onOpen: () => void
}): JSX.Element {
  return (
    <button type="button" className="capability-row" onClick={onOpen}>
      <div className="capability-row-main">
        <span className={`capability-icon-tile level-${capability.level}`}>
          <CapabilityIcon id={capability.id} size={17} />
        </span>
        <div className="capability-row-text">
          <span className="text-body capability-name">{capability.label}</span>
          <span className="text-hint capability-desc">{capability.description}</span>
        </div>
      </div>
      <div className="capability-row-status">
        <CapabilityMeter level={capability.level} showLabel={false} />
        <ChevronRightIcon size={16} className="capability-chevron" />
      </div>
    </button>
  )
}

export default function CapabilityList({
  capabilities,
  hasRunTest,
  canRunTest,
  onOpenDetails,
  onRunTest,
}: CapabilityListProps): JSX.Element {
  return (
    <Section
      title="Capabilities"
      icon={<ZapIcon size={15} />}
      className="capability-list-section"
    >
      {!hasRunTest ? (
        <div className="section-placeholder">
          <ZapIcon size={24} className="section-placeholder-icon" />
          <p className="text-hint">
            Run a speed test to see what your connection can handle.
          </p>
          <button
            type="button"
            className="btn-primary capability-run-btn"
            onClick={onRunTest}
            disabled={!canRunTest}
          >
            <PlayIcon size={13} />
            Run speed test
          </button>
        </div>
      ) : (
        <div className="capability-list">
          {capabilities.map((capability) => (
            <CapabilityRow key={capability.id} capability={capability} onOpen={onOpenDetails} />
          ))}
        </div>
      )}
    </Section>
  )
}
