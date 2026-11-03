import { useId } from 'react'
import type { IconProps } from './Icons'

/**
 * The Rove Mark — a filled centre dot inside an open ring. By default it's drawn
 * in `currentColor` (fill + stroke) so it inherits the accent color from its
 * container, matching the tray icon. Pass `hasGradient` for the app-icon treatment
 * — the same top-to-bottom blue the 1024px dock icon uses.
 */
export function BrandIcon({
  size = 20,
  className,
  hasGradient = false,
}: IconProps & { hasGradient?: boolean }): JSX.Element {
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
