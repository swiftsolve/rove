import type { ReactNode } from 'react'

import type { IconProps } from './Icons'

/** The 24-grid stroke frame the custom icons share with the Lucide aliases. */
export function CustomIcon({ size, className, children }: IconProps & { children: ReactNode }) {
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
