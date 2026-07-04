import type { CapabilityRating, SpeedResult } from '@shared/types'
import { explainCapability } from '../utils/capability-detail'
import CapabilityIcon from './visual/CapabilityIcon'
import CapabilityMeter from './visual/CapabilityMeter'
import Subpage from './ui/Subpage'
import './CapabilityDetails.css'

interface CapabilityDetailsProps {
  readonly capabilities: readonly CapabilityRating[]
  readonly speed: SpeedResult
  readonly onBack: () => void
}

function CapabilityDetailCard({
  capability,
  speed,
}: {
  readonly capability: CapabilityRating
  readonly speed: SpeedResult
}): JSX.Element {
  const { summary, checks } = explainCapability(capability.id, capability.level, speed)

  return (
    <section className="cap-detail surface">
      <header className="cap-detail-head">
        <CapabilityIcon id={capability.id} size={16} className="cap-detail-icon" />
        <span className="cap-detail-name">{capability.label}</span>
        <CapabilityMeter level={capability.level} />
      </header>

      <p className="cap-detail-summary">{summary}</p>

      <div className="cap-metrics">
        {checks.map((check) => (
          <div key={check.label} className={`cap-metric ${check.pass ? 'pass' : 'fail'}`}>
            <span className="cap-metric-label">{check.label}</span>
            <span className="cap-metric-value num">{check.have}</span>
            <span className="cap-metric-need">{check.need}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function CapabilityDetails({
  capabilities,
  speed,
  onBack,
}: CapabilityDetailsProps): JSX.Element {
  return (
    <Subpage
      title="Capabilities"
      description="How your last speed test measured up against what each activity needs."
      onBack={onBack}
    >
      <div className="cap-detail-list">
        {capabilities.map((capability) => (
          <CapabilityDetailCard key={capability.id} capability={capability} speed={speed} />
        ))}
      </div>
    </Subpage>
  )
}
