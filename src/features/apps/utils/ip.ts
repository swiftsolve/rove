/** Is this peer address on the user's own network — a router or LAN device
 *  rather than a public host out on the internet? Covers the ranges that read as
 *  "local" to a person: RFC-1918, loopback, link-local, CGNAT, and the IPv6
 *  loopback / link-local / unique-local ranges. Anything unrecognised is treated
 *  as public: it's the safer default for a "this is local" cue. */
export function isPrivateIp(ip: string): boolean {
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const a = Number(v4[1])
    const b = Number(v4[2])
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
  if (ip.includes(':')) {
    if (ip === '::1' || ip === '::') return true // loopback / unspecified
    // First 16-bit hextet; a leading "::" means that group is zero.
    const head = ip.startsWith('::') ? 0 : parseInt(ip.split(':')[0] || '', 16)
    if (Number.isNaN(head)) return false
    return (head & 0xffc0) === 0xfe80 /* fe80::/10 */ || (head & 0xfe00) === 0xfc00 /* fc00::/7 */
  }
  return false
}
