import { CustomIcon } from './CustomIcon'
import type { IconProps } from './Icons'

/** Lucide's house without its door. */
const HOUSE =
  'M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'

/**
 * A house with a Wi‑Fi signal where the door would be: a connected home
 * device, apart from Home's own house, which keeps its door.
 */
export function SmartHomeIcon({ size = 16, className }: IconProps) {
  return (
    <CustomIcon size={size} className={className}>
      <path d={HOUSE} />
      <path d="M12 17h.01" />
      <path d="M9.88 14.88a3 3 0 0 1 4.24 0" />
      <path d="M7.76 12.76a6 6 0 0 1 8.48 0" />
    </CustomIcon>
  )
}
