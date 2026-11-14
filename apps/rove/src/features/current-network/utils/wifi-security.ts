/** Strongest first: the collapsed strip names the best protocol the network offers. */
const SECURITY_PROTOCOLS = ['WPA3', 'WPA2', 'WPA', 'OWE', 'WEP']

/** The OS's security string with runs of spaces collapsed: Windows reports e.g. "WPA3-Personal  (H2E)". */
export function normalizeSecurity(security: string): string {
  return security.trim().replace(/\s+/g, ' ')
}

/**
 * The strongest protocol named in an OS security string, for tight spaces:
 * "WPA3-Personal (H2E)" → "WPA3", "WPA2 WPA3" (transition mode) → "WPA3".
 * Falls back to the full string when none is recognised (e.g. "802.1X").
 */
export function shortSecurityLabel(security: string): string {
  const tokens = security.toUpperCase().split(/[^A-Z0-9]+/)
  return SECURITY_PROTOCOLS.find((protocol) => tokens.includes(protocol)) ?? security
}

/** Broken protocols: WEP's key falls in minutes, and WPA's TKIP is retired. */
const WEAK_PROTOCOLS = new Set(['WEP', 'WPA'])

/** True when the strongest protocol a secured network offers is a broken one, so "WPA/WPA2" isn't weak. */
export function isWeakSecurity(security: string): boolean {
  return WEAK_PROTOCOLS.has(shortSecurityLabel(security))
}
