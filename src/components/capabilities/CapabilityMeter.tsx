import type { CapabilityLevel } from '@/types'
import { CAPABILITY_LEVEL_LABELS } from '@/types'
import './CapabilityMeter.css'

const LEVEL_CLASS: Record<CapabilityLevel, string> = {
  excellent: 'level-excellent',
  good: 'level-good',
  fair: 'level-fair',
  poor: 'level-poor',
  unsupported: 'level-unsupported',
}

const LEVEL_RANK: Record<CapabilityLevel, number> = {
  excellent: 4,
  good: 3,
  fair: 2,
  poor: 1,
  unsupported: 0,
}

const SEGMENTS = [0, 1, 2, 3]

export default function CapabilityMeter({
  level,
  showLabel = true,
}: {
  readonly level: CapabilityLevel
  readonly showLabel?: boolean
}): JSX.Element {
  const rank = LEVEL_RANK[level]

  return (
    <div className={`capability-status ${LEVEL_CLASS[level]}`}>
      <span className="capability-meter" aria-hidden>
        {SEGMENTS.map((i) => (
          <span key={i} className={`capability-seg${i < rank ? ' on' : ''}`} />
        ))}
      </span>
      {showLabel && (
        <span className="capability-level">{CAPABILITY_LEVEL_LABELS[level]}</span>
      )}
    </div>
  )
}
