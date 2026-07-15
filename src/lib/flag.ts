/**
 * Turn an ISO-3166 alpha-2 country code into its flag emoji by mapping each
 * letter to its Regional Indicator Symbol (U+1F1E6 + offset from 'A'). Returns
 * null for anything that isn't two ASCII letters, so callers can cleanly render
 * "no flag" for unresolved / private-network peers.
 */
export function countryCodeToFlag(code: string | null | undefined): string | null {
  if (!code || code.length !== 2) return null
  const cc = code.toUpperCase()
  if (!/^[A-Z]{2}$/.test(cc)) return null
  const BASE = 0x1f1e6 // Regional Indicator Symbol Letter A
  return String.fromCodePoint(
    BASE + (cc.charCodeAt(0) - 65),
    BASE + (cc.charCodeAt(1) - 65),
  )
}

// Resolve the human-readable country name once — Intl.DisplayNames is stateless
// and reusable, so we avoid rebuilding it per host row.
const regionNames =
  typeof Intl !== 'undefined' && 'DisplayNames' in Intl
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null

/**
 * Map an ISO-3166 alpha-2 country code to its English country name (e.g. "US" →
 * "United States"), for the flag's hover tooltip. Returns null for anything that
 * isn't two ASCII letters or that the runtime can't resolve.
 */
export function countryCodeToName(code: string | null | undefined): string | null {
  if (!code || code.length !== 2) return null
  const cc = code.toUpperCase()
  if (!/^[A-Z]{2}$/.test(cc)) return null
  try {
    const name = regionNames?.of(cc)
    // DisplayNames echoes the input back when it has no entry for the region.
    return name && name !== cc ? name : null
  } catch {
    return null
  }
}
