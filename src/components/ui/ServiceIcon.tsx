import { useState } from 'react'
import './ServiceIcon.css'

// Suffixes that only ever name something on the local network, so the public
// icon service has nothing to serve for them and answers 404.
const PRIVATE_SUFFIXES = ['.local', '.lan', '.internal', '.home', '.home.arpa', '.localdomain']

/** Whether a public favicon could exist for `host`. LAN names (mDNS `.local`,
 *  bare single-label hostnames) and IP literals never resolve at the icon
 *  service — asking anyway just spends a request to be told 404. */
function mayHaveFavicon(host: string): boolean {
  const lower = host.trim().toLowerCase().replace(/\.$/, '')
  if (!lower) return false
  // IPv6 literal, bracketed or bare.
  if (lower.includes(':')) return false
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(lower)) return false
  if (!lower.includes('.')) return false
  return !PRIVATE_SUFFIXES.some((suffix) => lower.endsWith(suffix))
}

// Hosts whose favicon has already 404'd, remembered for the session so remounts
// (list polls, page switches) don't re-request an icon we know isn't there.
const failedFavicons = new Set<string>()

interface ServiceIconProps {
  /** Hostname whose favicon to show, e.g. "netflix.com". */
  readonly host: string
  /** Service label, used for the monogram fallback and alt text. */
  readonly name: string
  /** Rendered edge length in px. */
  readonly size?: number
  /**
   * A ready-to-render icon (e.g. a `data:` URI for an app's real OS icon) that
   * takes precedence over the favicon. Falls through to the favicon/monogram if
   * it's absent or fails to load.
   */
  readonly src?: string | null
  /**
   * What to render when no icon resolves. `'monogram'` (the default) keeps a
   * list's rows aligned by always occupying the box. `'none'` renders nothing —
   * for a standalone slot, where a bare letter reads as a glitch rather than as
   * a brand.
   */
  readonly fallback?: 'monogram' | 'none'
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
  const [srcFailed, setSrcFailed] = useState(false)
  // Favicon failure is tracked per host in `failedFavicons`, not in state, so it
  // survives remounts; this only re-renders us when a load error records one.
  const [, noteFaviconFailure] = useState(0)
  const dimensions = { width: size, height: size }

  if (src && !srcFailed) {
    return (
      <img
        className="service-icon"
        src={src}
        alt=""
        style={dimensions}
        onError={() => setSrcFailed(true)}
      />
    )
  }

  if (mayHaveFavicon(host) && !failedFavicons.has(host)) {
    return (
      <img
        className="service-icon"
        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`}
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
    <span className="service-icon service-icon--fallback" style={dimensions} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}
