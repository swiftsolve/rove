import type { IconProps } from './Icons'

/**
 * A hub-and-spoke network icon — a centre node linked to four surrounding
 * nodes. Custom (no exact Lucide match) but drawn to the same 24-grid, stroke
 * width and `currentColor` conventions as the aliased icons.
 */
export function ConnectionIcon({ size = 18, className }: IconProps) {
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
