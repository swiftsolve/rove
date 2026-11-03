import { useId } from 'react'
import type { IconProps } from './Icons'
import { CustomIcon } from './CustomIcon'

// Lucide's cloud, mirrored and at 0.4 scale, in the top-right corner.
const SMALL_CLOUD = 'M16.3 6.6h3.4a2.8 2.8 0 1 0-2.684-3.6H16.3a1.8 1.8 0 1 0 0 3.6Z'

/**
 * Lucide's gamepad-2 with a small cloud on its corner. The mask cuts the
 * controller 1.5 units clear of the cloud's stroke (4.75 = 1.75 + 2 × 1.5), so
 * the gap shows whatever is behind the icon.
 */
export function CloudGamingIcon({ size = 22, className }: IconProps) {
  const maskId = useId()
  return (
    <CustomIcon size={size} className={className}>
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
          <rect width="24" height="24" fill="white" stroke="none" />
          <path d={SMALL_CLOUD} fill="black" stroke="black" strokeWidth={4.75} />
        </mask>
      </defs>
      <g mask={`url(#${maskId})`}>
        <path d="M6 11h4M8 9v4M15 12h.01M18 10h.01" />
        <path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z" />
      </g>
      <path d={SMALL_CLOUD} />
    </CustomIcon>
  )
}
