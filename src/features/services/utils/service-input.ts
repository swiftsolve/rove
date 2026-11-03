import type { ServiceDefinition } from '@/types'
import { isIpv4 } from '@/utils/ip'

/** A plausible DNS hostname: dot-separated labels of letters/digits/hyphens. */
const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

/**
 * A display label from a host, e.g. api.github.com → "Github". An IP stays as-is.
 * Best-effort: good enough for a label, not a public-suffix parser.
 */
function deriveName(host: string): string {
  if (isIpv4(host)) return host
  const labels = host.split('.')
  // Assumes a one-label suffix, so "bbc.co.uk" reads as "Co".
  const core = (labels.length >= 2 ? labels[labels.length - 2] : labels[0]) ?? host
  return core.charAt(0).toUpperCase() + core.slice(1)
}

/**
 * Parse a URL, bare host or IP into a `{ name, host }`, or null when nothing
 * host-shaped is there. The port and path are dropped: the probe always targets
 * :443.
 */
export function parseServiceInput(raw: string): ServiceDefinition | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  // A scheme lets the URL parser handle "host:port/path" and bare hosts alike.
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
