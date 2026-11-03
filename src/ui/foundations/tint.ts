import type { CSSProperties } from 'react'

/** A tint: any CSS colour, usually a token (`var(--status-positive)`), or `neutral`, the quiet sunken look. */
export type TintColor = 'neutral' | (string & {})

/**
 * The style that tints an element in `color`: it sets the text colour, which
 * the icon strokes and a `bg-current/…` wash both follow. Neutral sets none,
 * leaving it to the element's neutral classes.
 */
export function tintStyle(color: TintColor): CSSProperties | undefined {
  return color === 'neutral' ? undefined : { color }
}
