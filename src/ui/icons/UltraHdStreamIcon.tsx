import type { IconProps } from './Icons'
import { CustomIcon } from './CustomIcon'

/**
 * 4K as bare lettering, drawn with HdStreamIcon's HD: one cap height
 * (y 6.5–17.5), 3.5 between letters (a stroke's width of clear space), and
 * Inter's skeletons (a closed 4, a K whose arm meets the stem).
 */
export function UltraHdStreamIcon({ size = 22, className }: IconProps) {
  return (
    <CustomIcon size={size} className={className}>
      <path d="M10.25 14.2H3.65L8.6 6.5v11" />
      <path d="M13.75 6.5v11M20.35 6.5l-6.6 7.15M16.17 11.01l4.18 6.49" />
    </CustomIcon>
  )
}
