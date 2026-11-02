/**
 * Hand-drawn icons, for what no Lucide icon fits. They share the Lucide
 * aliases' 24-grid, stroke and `currentColor`, so they sit beside them.
 */
import { useId } from 'react'
import type { ReactNode } from 'react'
import type { IconProps } from './Icons'

/** The 24-grid stroke frame the hand-drawn icons share with the Lucide aliases. */
function DrawnIcon({ size, className, children }: IconProps & { children: ReactNode }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  )
}

// HD and 4K as bare lettering: one cap height (y 6.5–17.5), 3.5 between letters
// (a stroke's width of clear space),
// Inter's skeletons (a closed 4, a K whose arm meets the stem).

export function HdStreamIcon({ size = 22, className }: IconProps): JSX.Element {
  return (
    <DrawnIcon size={size} className={className}>
      <path d="M3.375 6.5v11M9.975 6.5v11M3.375 12h6.6" />
      <path d="M13.475 6.5h2.2c2.7335 0 4.95 2.4618 4.95 5.5s-2.2165 5.5-4.95 5.5h-2.2Z" />
    </DrawnIcon>
  )
}

export function UltraHdStreamIcon({ size = 22, className }: IconProps): JSX.Element {
  return (
    <DrawnIcon size={size} className={className}>
      <path d="M10.25 14.2H3.65L8.6 6.5v11" />
      <path d="M13.75 6.5v11M20.35 6.5l-6.6 7.15M16.17 11.01l4.18 6.49" />
    </DrawnIcon>
  )
}

// Lucide's cloud, mirrored and at 0.4 scale, in the top-right corner.
const SMALL_CLOUD = 'M16.3 6.6h3.4a2.8 2.8 0 1 0-2.684-3.6H16.3a1.8 1.8 0 1 0 0 3.6Z'

/**
 * Lucide's gamepad-2 with a small cloud on its corner. The mask cuts the
 * controller 1.5 units clear of the cloud's stroke (4.75 = 1.75 + 2 × 1.5), so
 * the gap shows whatever is behind the icon.
 */
export function CloudGamingIcon({ size = 22, className }: IconProps): JSX.Element {
  const maskId = useId()
  return (
    <DrawnIcon size={size} className={className}>
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
    </DrawnIcon>
  )
}

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
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden
    >
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

/**
 * A hub-and-spoke network icon — a centre node linked to four surrounding
 * nodes. Custom (no exact Lucide match) but drawn to the same 24-grid, stroke
 * width and `currentColor` conventions as the aliased icons.
 */
export function ConnectionIcon({ size = 18, className }: IconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {/* spokes: centre-node edge → outer-node edge */}
      <line x1="12" y1="6" x2="12" y2="10" />
      <line x1="12" y1="14" x2="12" y2="18" />
      <line x1="6" y1="12" x2="10" y2="12" />
      <line x1="14" y1="12" x2="18" y2="12" />
      {/* centre + four nodes */}
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="4" r="2" />
      <circle cx="12" cy="20" r="2" />
      <circle cx="4" cy="12" r="2" />
      <circle cx="20" cy="12" r="2" />
    </svg>
  )
}
