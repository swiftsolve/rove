import 'ldrs/react/Waveform.css'

import { Waveform } from 'ldrs/react'

/**
 * The one loading indicator (ldrs "waveform"), so every loading state looks
 * alike. Callers own its centring and spacing (`.page-empty`).
 */
export function Spinner({
  size = 24,
}: {
  /** Its width in px. */
  size?: number
}) {
  return <Waveform size={size} stroke={3} speed={1} color="var(--accent-default)" />
}
