// Regional Indicator Symbol Letter A; the flag for "XY" is the pair of
// indicators at offsets X-'A' and Y-'A' from it.
const REGIONAL_INDICATOR_A = 0x1f1e6
const CHAR_CODE_A = 65

// Resolve the human-readable country name once — Intl.DisplayNames is stateless
// and reusable, so we avoid rebuilding it per host row.
const regionNames =
  typeof Intl !== 'undefined' && 'DisplayNames' in Intl
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null

/** Upper-cased code when it's exactly two ASCII letters, else null. */
function normalizeCountryCode(code: string | null | undefined): string | null {
  if (!code || code.length !== 2) return null
  const upper = code.toUpperCase()
  return /^[A-Z]{2}$/.test(upper) ? upper : null
}

/**
 * Turn an ISO-3166 alpha-2 country code into its flag emoji. Returns null for
 * anything that isn't two ASCII letters, so callers can cleanly render "no flag"
 * for unresolved / private-network peers.
 */
export function countryCodeToFlag(code: string | null | undefined): string | null {
  const cc = normalizeCountryCode(code)
  if (!cc) return null
  return String.fromCodePoint(
    REGIONAL_INDICATOR_A + (cc.charCodeAt(0) - CHAR_CODE_A),
    REGIONAL_INDICATOR_A + (cc.charCodeAt(1) - CHAR_CODE_A),
  )
}

/**
 * Map an ISO-3166 alpha-2 country code to its English country name (e.g. "US" →
 * "United States"), for the flag's hover tooltip. Returns null for anything that
 * isn't two ASCII letters or that the runtime can't resolve.
 */
export function countryCodeToName(code: string | null | undefined): string | null {
  const cc = normalizeCountryCode(code)
  if (!cc) return null
  try {
    const name = regionNames?.of(cc)
    // DisplayNames echoes the input back when it has no entry for the region.
    return name && name !== cc ? name : null
  } catch {
    return null
  }
}
