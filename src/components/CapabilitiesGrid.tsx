import type { CapabilityRating } from '@shared/types'
import CapabilityIcon from './visual/CapabilityIcon'
import CapabilityMeter from './visual/CapabilityMeter'
import Section from './ui/Section'
import { ChevronRightIcon, ZapIcon } from './Icons'
import './CapabilitiesGrid.css'

interface CapabilitiesGridProps {
  readonly capabilities: readonly CapabilityRating[]
  readonly hasRunTest: boolean
  readonly onOpenDetails: () => void
}

function CapabilityRow({
  capability,
  onOpen,
}: {
  readonly capability: CapabilityRating
  readonly onOpen: () => void
}): JSX.Element {
  return (
    <button type="button" className={`capability-row level-${capability.level}`} onClick={onOpen}>
      <div className="capability-row-main">
        <span className="capability-icon-tile">
          <CapabilityIcon id={capability.id} size={17} />
        </span>
        <div className="capability-row-text">
          <span className="text-body capability-name">{capability.label}</span>
          <span className="text-hint capability-desc">{capability.description}</span>
        </div>
      </div>
      <CapabilityMeter level={capability.level} showLabel={false} />
      <ChevronRightIcon size={16} className="capability-chevron" />
    </button>
  )
}

export default function CapabilitiesGrid({
  capabilities,
  hasRunTest,
  onOpenDetails,
}: CapabilitiesGridProps): JSX.Element {
  return (
    <Section title="Capabilities" icon={<ZapIcon size={15} />}>
      {!hasRunTest ? (
        <div className="section-placeholder">
          <ZapIcon size={24} className="section-placeholder-icon" />
          <p className="text-hint">
            Run a speed test to see how well your connection handles streaming, gaming, and
            video calls.
          </p>
        </div>
      ) : (
        <div className="row-list">
          {capabilities.map((capability) => (
            <CapabilityRow key={capability.id} capability={capability} onOpen={onOpenDetails} />
          ))}
        </div>
      )}
    </Section>
  )
}
