import { cx } from 'class-variance-authority'
import { type JSX, useState } from 'react'

// Suffixes that only ever name something on the local network, so the public
// icon service has nothing to serve for them and answers 404.
const PRIVATE_SUFFIXES = ['.local', '.lan', '.internal', '.home', '.home.arpa', '.localdomain']
const IPV4_LITERAL = /^\d{1,3}(\.\d{1,3}){3}$/
// No backing chip: favicons render on the panel directly, so logos with
// transparent padding blend in instead of flashing a white square. Most service
// favicons carry their own background, so this reads cleanly.
const ICON = 'shrink-0 rounded-xs object-contain'
const MONOGRAM = cx(
  ICON,
  'inline-flex items-center justify-center bg-hover',
  'text-2xs font-semibold leading-none text-secondary',
)

// Requested well above the rendered size so it stays crisp on high-DPI screens.
const FAVICON_REQUEST_PX = 64

/** Whether a public favicon could exist for `host`. LAN names (mDNS `.local`,
 *  bare single-label hostnames) and IP literals never resolve at the icon
 *  service — asking anyway just spends a request to be told 404. */
function mayHaveFavicon(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/\.$/, '')
  if (!normalized) return false
  // IPv6 literal, bracketed or bare.
  if (normalized.includes(':')) return false
  if (IPV4_LITERAL.test(normalized)) return false
  if (!normalized.includes('.')) return false
  return !PRIVATE_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
}

function faviconUrl(host: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${FAVICON_REQUEST_PX}`
}

// Hosts whose favicon has already 404'd, remembered for the session so remounts
// (list polls, page switches) don't re-request an icon we know isn't there.
const failedFavicons = new Set<string>()

type ServiceIconProps = {
  /** Hostname whose favicon to show, e.g. "netflix.com". */
  host: string
  /** Service label, used for the monogram fallback and alt text. */
  name: string
  /** Rendered edge length in px. */
  size?: number
  /**
   * A ready-to-render icon (e.g. a `data:` URI for an app's real OS icon) that
   * takes precedence over the favicon. Falls through to the favicon/monogram if
   * it's absent or fails to load.
   */
  src?: string | null
  /**
   * What to render when no icon resolves. `'monogram'` (the default) keeps a
   * list's rows aligned by always occupying the box. `'none'` renders nothing —
   * for a standalone slot, where a bare letter reads as a glitch rather than as
   * a brand.
   */
  fallback?: 'monogram' | 'none'
}

/** An icon for a service or app, resolved in three tiers: an explicit `src`
 *  (e.g. the app's real OS icon), then the registered-domain favicon via Google's
 *  icon service (requested at 64px so it stays crisp on high-DPI screens even in a
 *  ~16px box), then a letter monogram (or nothing — see `fallback`). Each tier
 *  falls through to the next on a missing source or a load error. */
export function ServiceIcon({
  host,
  name,
  size = 16,
  src,
  fallback = 'monogram',
}: ServiceIconProps): JSX.Element | null {
  const [hasSrcFailed, setHasSrcFailed] = useState(false)
  // Favicon failure is tracked per host in `failedFavicons`, not in state, so it
  // survives remounts; this only re-renders us when a load error records one.
  const [, noteFaviconFailure] = useState(0)
  const dimensions = { width: size, height: size }

  if (src && !hasSrcFailed) {
    return <img className={ICON} src={src} alt="" style={dimensions} onError={() => setHasSrcFailed(true)} />
  }

  if (mayHaveFavicon(host) && !failedFavicons.has(host)) {
    return (
      <img
        className={ICON}
        src={faviconUrl(host)}
        alt=""
        style={dimensions}
        loading="lazy"
        onError={() => {
          failedFavicons.add(host)
          noteFaviconFailure((n) => n + 1)
        }}
      />
    )
  }

  if (fallback === 'none') return null

  return (
    <span className={MONOGRAM} style={dimensions} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}
