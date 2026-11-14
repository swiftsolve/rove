import type { ReactNode } from 'react'

type SpokenTextProps = {
  /** What the screen shows. */
  children: ReactNode
  /** What a screen reader says instead, in plain words: "at least 25 Mbps" for "≥ 25 Mbps". */
  spoken: string
}

/**
 * Text that reads differently than it looks: the screen shows `children`,
 * and a screen reader hears `spoken`, so it never reads out a symbol such as
 * "≥", a bracket or a slash.
 */
export function SpokenText({ children, spoken }: SpokenTextProps) {
  return (
    <>
      <span aria-hidden>{children}</span>
      <span className="sr-only">{spoken}</span>
    </>
  )
}
