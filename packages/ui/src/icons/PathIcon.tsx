import { CustomIcon } from './CustomIcon'
import type { IconProps } from './Icons'

/**
 * A winding path between two end nodes with a stop in the middle: this
 * computer, the router, the internet. Custom, after Lucide's route, on the
 * aliases' 24-grid and stroke.
 */
export function PathIcon({ size = 18, className }: IconProps) {
  return (
    <CustomIcon size={size} className={className}>
      <circle cx="19" cy="19" r="2" />
      <path d="M17 19H6.5a3.5 3.5 0 0 1 0-7H10" />
      <rect x="10" y="10" width="4" height="4" rx="1" />
      <path d="M14 12h3.5a3.5 3.5 0 0 0 0-7H7" />
      <circle cx="5" cy="5" r="2" />
    </CustomIcon>
  )
}
