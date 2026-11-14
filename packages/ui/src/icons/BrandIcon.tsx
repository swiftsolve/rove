import { useId } from 'react'

import type { IconProps } from './Icons'

/**
 * The Rove Mark: a filled centre dot inside an open ring, in its container's
 * colour like the tray icon. `hasGradient` gives it the dock icon's
 * top-to-bottom blue.
 */
export function BrandIcon({ size = 20, className, hasGradient = false }: IconProps & { hasGradient?: boolean }) {
  const gradientId = useId()
  const paint = hasGradient ? `url(#${gradientId})` : 'currentColor'
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} aria-hidden>
      {hasGradient && (
        <defs>
          <linearGradient id={gradientId} x1="24" y1="7" x2="24" y2="41" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#7aa4ff" />
            <stop offset="1" stopColor="#5484f5" />
          </linearGradient>
        </defs>
      )}
      <circle cx="24" cy="24" r="7.5" fill={paint} />
      <path
        d="M 11.98 36.02 A 17 17 0 1 1 36.02 36.02"
        fill="none"
        stroke={paint}
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  )
}
