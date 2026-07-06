import { Waveform } from 'ldrs/react'
import 'ldrs/react/Waveform.css'

/**
 * Shared loading indicator. Wraps the ldrs "waveform" loader so every loading
 * state across the app shares one look. Callers keep their own layout wrapper
 * (e.g. `.view-empty`, `.loading-screen`) for centring and spacing.
 */
export function Spinner({ size = 24 }: { readonly size?: number }): JSX.Element {
  return <Waveform size={size} stroke={3} speed={1} color="var(--accent)" />
}
