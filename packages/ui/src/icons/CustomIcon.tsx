import type { ReactNode } from 'react'

import type { IconProps } from './Icons'

/** The stroke every icon draws with, Lucide aliases and custom icons alike. */
export const ICON_STROKE_WIDTH = 1.75

/** The 24-grid stroke frame the custom icons share with the Lucide aliases. */
export function CustomIcon({ size, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={ICON_STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  )
}
