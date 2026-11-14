const DOTTED_QUAD = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
// An IPv4 address carried in IPv6 (::ffff:a.b.c.d, or its hex form ::ffff:hhhh:hhhh),
// as a dual-stack socket reports an IPv4 peer.
const MAPPED_DOTTED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i
const MAPPED_HEX = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i

/**
 * The four octets of a dotted-quad IPv4 literal ("192.168.1.1"), or null when
 * `text` isn't one or an octet is over 255.
 */
export function parseIpv4(text: string): number[] | null {
  const match = DOTTED_QUAD.exec(text)
  if (!match) return null
  const octets = match.slice(1).map(Number)
  return octets.every((octet) => octet <= 255) ? octets : null
}

/** Whether `text` is a dotted-quad IPv4 literal. */
export function isIpv4(text: string): boolean {
  return parseIpv4(text) !== null
}

/** The IPv4 octets an IPv4-mapped IPv6 address carries, or null for any other. */
function parseMappedIpv4(ip: string): number[] | null {
  const dotted = MAPPED_DOTTED.exec(ip)
  if (dotted?.[1]) return parseIpv4(dotted[1])
  const hex = MAPPED_HEX.exec(ip)
  if (!hex?.[1] || !hex[2]) return null
  const high = parseInt(hex[1], 16)
  const low = parseInt(hex[2], 16)
  return [high >> 8, high & 0xff, low >> 8, low & 0xff]
}

function isPrivateIpv4([a = -1, b = -1]: number[]): boolean {
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 127 || // loopback
    (a === 169 && b === 254) || // link-local
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 carrier-grade NAT
    a === 0 // unspecified
  )
}

/**
 * Whether a peer address is on the user's own network: RFC 1918, loopback,
 * link-local, CGNAT and their IPv6 counterparts, IPv4-mapped IPv6 included.
 * Anything unrecognised counts as public, the safer default for a "this is
 * local" cue.
 */
export function isPrivateIp(ip: string): boolean {
  const ipv4Octets = parseIpv4(ip) ?? parseMappedIpv4(ip)
  if (ipv4Octets) return isPrivateIpv4(ipv4Octets)
  if (ip.includes(':')) {
    if (ip === '::1' || ip === '::') return true // loopback / unspecified
    // First 16-bit hextet; a leading "::" means that group is zero.
    const firstHextet = ip.startsWith('::') ? 0 : parseInt(ip.split(':')[0] || '', 16)
    if (Number.isNaN(firstHextet)) return false
    return (firstHextet & 0xffc0) === 0xfe80 /* fe80::/10 */ || (firstHextet & 0xfe00) === 0xfc00 /* fc00::/7 */
  }
  return false
}
