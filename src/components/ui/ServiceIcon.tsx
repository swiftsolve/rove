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

/** Registered-domain favicon via Google's icon service, requested at 64px so it
 *  stays crisp on high-DPI screens even though it renders into a ~16px box. Keyed
 *  on host so any service — including ones added later — gets an icon for free.
 *  Falls back to a letter monogram when the fetch fails. */
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
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`}
      alt=""
      style={dimensions}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}
