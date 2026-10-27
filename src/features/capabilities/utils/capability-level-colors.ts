import type { CapabilityLevel } from '@/types'

/** Each level's fill colour, for glyphs, chips and meter bars (3:1 is enough). */
export const CAPABILITY_LEVEL_FILL_COLORS: Record<CapabilityLevel, string> = {
  excellent: 'text-status-positive',
  good: 'text-status-good',
  fair: 'text-status-warning',
  poor: 'text-status-poor',
  unsupported: 'text-tertiary',
}

/** Each level's text shade, for words beside a level: darker than the fill so
 *  it reaches 4.5:1. */
export const CAPABILITY_LEVEL_TEXT_COLORS: Record<CapabilityLevel, string> = {
  excellent: 'text-positive',
  good: 'text-good',
  fair: 'text-warning',
  poor: 'text-poor',
  unsupported: 'text-tertiary',
}
