import 'ldrs/react/Ring.css'

import { Ring } from 'ldrs/react'

/**
 * Compact busy indicator for buttons. Uses the ldrs "ring" loader so buttons
 * show a smooth rotating arc instead of a spinning icon. Colour is inherited
 * from the button via `currentColor`, so it works on both primary (white text)
 * and secondary/icon buttons.
 */
export function ButtonSpinner({
  size = 14,
  color = 'currentColor',
}: {
  /** In px: match the icon it replaces. */
  size?: number
  /** Any CSS colour. */
  color?: string
}) {
  return <Ring size={size} stroke={2} bgOpacity={0.2} speed={2} color={color} />
}
