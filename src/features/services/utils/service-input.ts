import type { ServiceDefinition } from '@/types'

/** A dotted-quad IPv4 literal, e.g. "192.168.1.1". */
const IPV4 = /^(\d{1,3})(\.\d{1,3}){3}$/
/** A plausible DNS hostname: dot-separated labels of letters/digits/hyphens. */
const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

function isIpv4(host: string): boolean {
  return IPV4.test(host) && host.split('.').every((o) => Number(o) <= 255)
}

/** Derive a display label from a host: an IP stays as-is; a hostname becomes
 *  its registrable label, capitalized (api.github.com → "Github", zoom.us →
 *  "Zoom"). Best-effort — good enough for a card label, not a PSL parser. */
function deriveName(host: string): string {
  if (isIpv4(host)) return host
  const labels = host.split('.')
  // The label before the public suffix — the second-to-last for a normal
  // "name.tld", falling back to the first for anything shorter.
  const core = (labels.length >= 2 ? labels[labels.length - 2] : labels[0]) ?? host
  return core.charAt(0).toUpperCase() + core.slice(1)
}

/**
 * Parse a user's free-form entry — a URL ("https://github.com/x"), a bare host
 * ("github.com"), or an IP ("192.168.1.1:8080") — into a `{ name, host }` we can
 * probe and label. Returns null when nothing host-shaped can be extracted.
 *
 * The port and path are intentionally dropped: the reachability probe always
 * targets :443, and the host is all the favicon and probe need.
 */
export function parseServiceInput(raw: string): ServiceDefinition | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  // Prepending a scheme lets the URL parser handle "host:port/path" and bare
  // hosts uniformly; a string that already carries a scheme is left alone.
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  let host: string
  try {
    host = new URL(withScheme).hostname.toLowerCase()
  } catch {
    return null
  }
  // URL keeps IPv6 in brackets; strip them so the host is probe-ready.
  host = host.replace(/^\[|\]$/g, '')

  if (!isIpv4(host) && !HOSTNAME.test(host)) return null

  return { name: deriveName(host), host }
}
