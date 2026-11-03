import { isIpv4 } from '@/lib/ip'

// Suffixes that only ever name something on the local network, so the public
// icon service has nothing to serve for them and answers 404.
const PRIVATE_SUFFIXES = ['.local', '.lan', '.internal', '.home', '.home.arpa', '.localdomain']

// Well above the rendered size, so it stays crisp on high-DPI screens.
const FAVICON_REQUEST_PX = 64

/**
 * Whether a public favicon could exist for `host`. LAN names and IP literals
 * only ever get a 404 from the icon service, so they aren't asked for.
 */
export function mayHaveFavicon(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/\.$/, '')
  if (!normalized) return false
  // An IPv6 literal, bracketed or bare.
  if (normalized.includes(':')) return false
  if (isIpv4(normalized)) return false
  if (!normalized.includes('.')) return false
  return !PRIVATE_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
}

/** The icon service's address for `host`'s favicon. */
export function faviconUrl(host: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${FAVICON_REQUEST_PX}`
}
