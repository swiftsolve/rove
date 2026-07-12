import { useState } from 'react'
import './ServiceIcon.css'

interface ServiceIconProps {
  /** Hostname whose favicon to show, e.g. "netflix.com". */
  readonly host: string
  /** Service label, used for the monogram fallback and alt text. */
  readonly name: string
  /** Rendered edge length in px. */
  readonly size?: number
}

/** Registered-domain favicon via DuckDuckGo's icon proxy. Keyed on host so any
 *  service — including ones added later — gets an icon for free. Falls back to a
 *  letter monogram when the host has no favicon or the fetch fails. */
export function ServiceIcon({ host, name, size = 16 }: ServiceIconProps): JSX.Element {
  const [failed, setFailed] = useState(false)
  const dimensions = { width: size, height: size }

  if (failed || !host) {
    return (
      <span className="service-icon service-icon--fallback" style={dimensions} aria-hidden="true">
        {name.trim().charAt(0).toUpperCase() || '?'}
      </span>
    )
  }

  return (
    <img
      className="service-icon"
      src={`https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`}
      alt=""
      style={dimensions}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}
