/**
 * Regional Indicator Symbol Letter A; the flag for "XY" is the pair of
 * indicators at offsets X-'A' and Y-'A' from it.
 */
const REGIONAL_INDICATOR_A = 0x1f1e6
const CHAR_CODE_A = 65

/** Built once rather than per host row. */
const regionNames =
  typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'region' }) : null

/** Upper-cased code when it's exactly two ASCII letters, else null. */
function normalizeCountryCode(code: string | null | undefined): string | null {
  if (code?.length !== 2) return null
  const upper = code.toUpperCase()
  return /^[A-Z]{2}$/.test(upper) ? upper : null
}

/**
 * An ISO-3166 alpha-2 country code's flag emoji, or null for anything that isn't
 * two ASCII letters (unresolved or private-network peers).
 */
export function countryCodeToFlag(code: string | null | undefined): string | null {
  const countryCode = normalizeCountryCode(code)
  if (!countryCode) return null
  return String.fromCodePoint(
    REGIONAL_INDICATOR_A + (countryCode.charCodeAt(0) - CHAR_CODE_A),
    REGIONAL_INDICATOR_A + (countryCode.charCodeAt(1) - CHAR_CODE_A),
  )
}

/**
 * An ISO-3166 alpha-2 country code's English name (e.g. "US" → "United States"),
 * or null when it isn't two ASCII letters or the runtime can't resolve it.
 */
export function countryCodeToName(code: string | null | undefined): string | null {
  const countryCode = normalizeCountryCode(code)
  if (!countryCode) return null
  try {
    const name = regionNames?.of(countryCode)
    // DisplayNames echoes the input back when it has no entry for the region.
    return name && name !== countryCode ? name : null
  } catch {
    return null
  }
}
