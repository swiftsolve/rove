import { CustomIcon } from './CustomIcon'
import type { IconProps } from './Icons'

/**
 * A hub-and-spoke network icon: a centre node linked to four others. Custom,
 * as Lucide has no exact match, on the aliases' 24-grid and stroke.
 */
export function ConnectionIcon({ size = 18, className }: IconProps) {
  return (
    <CustomIcon size={size} className={className}>
      <line x1="12" y1="6" x2="12" y2="10" />
      <line x1="12" y1="14" x2="12" y2="18" />
      <line x1="6" y1="12" x2="10" y2="12" />
      <line x1="14" y1="12" x2="18" y2="12" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="4" r="2" />
      <circle cx="12" cy="20" r="2" />
      <circle cx="4" cy="12" r="2" />
      <circle cx="20" cy="12" r="2" />
    </CustomIcon>
  )
}
