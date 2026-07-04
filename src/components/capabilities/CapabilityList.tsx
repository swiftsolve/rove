import type { CapabilityRating } from '@/types'
import CapabilityIcon from '@/components/capabilities/CapabilityIcon'
import CapabilityMeter from '@/components/capabilities/CapabilityMeter'
import Section from '@/components/ui/Section'
import { ChevronRightIcon, ZapIcon } from '@/components/ui/Icons'
import './CapabilityList.css'

interface CapabilityListProps {
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
  onOpenDetails,
}: CapabilityListProps): JSX.Element {
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
