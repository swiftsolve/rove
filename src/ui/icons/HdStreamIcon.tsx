import type { IconProps } from './Icons'
import { CustomIcon } from './CustomIcon'

/**
 * HD as bare lettering, drawn with UltraHdStreamIcon's 4K: one cap height
 * (y 6.5–17.5), 3.5 between letters (a stroke's width of clear space), and
 * Inter's skeletons.
 */
export function HdStreamIcon({ size = 22, className }: IconProps) {
  return (
    <CustomIcon size={size} className={className}>
      <path d="M3.375 6.5v11M9.975 6.5v11M3.375 12h6.6" />
      <path d="M13.475 6.5h2.2c2.7335 0 4.95 2.4618 4.95 5.5s-2.2165 5.5-4.95 5.5h-2.2Z" />
    </CustomIcon>
  )
}
