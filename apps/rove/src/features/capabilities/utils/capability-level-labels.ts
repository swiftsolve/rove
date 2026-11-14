import type { CapabilityLevel } from '@/types'

/** How each capability level is named in the UI. */
export const CAPABILITY_LEVEL_LABELS: Record<CapabilityLevel, string> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
  unsupported: 'Unsupported',
}
