import 'ldrs/react/Ring.css'

import { Ring } from 'ldrs/react'

/**
 * A button's busy indicator: an ldrs ring in the button's text colour, so it
 * suits a solid, soft or icon button alike.
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
