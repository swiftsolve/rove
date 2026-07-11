import { useEffect, useState } from 'react'
import type { WifiShare } from '@/types'
import { getNetworkApi } from '@/bridge/networkApi'
import { CheckIcon, CopyIcon } from '@/components/ui/Icons'
import { Spinner } from '@/components/ui/Spinner'
import './WifiShareDialog.css'

/** Human label for the QR's encryption token. */
function securityLabel(share: WifiShare): string {
  switch (share.encryption) {
    case 'nopass':
      return 'Open network'
    case 'WEP':
      return 'WEP'
    default:
      return 'WPA/WPA2'
  }
}

/** A labelled credential row with a copy-to-clipboard button. */
function CopyRow({ label, value }: { readonly label: string; readonly value: string }): JSX.Element {
  const [copied, setCopied] = useState(false)

  const handleCopy = (): void => {
    void navigator.clipboard
      ?.writeText(value)
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => undefined)
  }

  return (
    <div className="wifi-share-row">
      <div className="wifi-share-row-text">
        <span className="wifi-share-row-label">{label}</span>
        <span className="wifi-share-row-value">{value}</span>
      </div>
      <button
        type="button"
        className="btn-icon btn-icon-secondary"
        onClick={handleCopy}
        aria-label={copied ? `${label} copied` : `Copy ${label.toLowerCase()}`}
      >
        {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
      </button>
    </div>
  )
}

/**
 * Modal that turns the current Wi-Fi connection into a scannable QR code plus
 * copyable credentials. Fetches the payload from the backend on open; the
 * passphrase is read behind an OS auth prompt, so the fetch can take a moment
 * (or come back without a password if the user declines).
 */
export default function WifiShareDialog({ onClose }: { readonly onClose: () => void }): JSX.Element {
  const [share, setShare] = useState<WifiShare | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getNetworkApi()
      .getWifiShare()
      .then((result) => {
        if (!cancelled) setShare(result)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const secured = share != null && share.encryption !== 'nopass'

  return (
    <div className="wifi-share-overlay" role="presentation" onClick={onClose}>
      <div
        className="wifi-share-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wifi-share-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="wifi-share-title" className="wifi-share-title">
          Share Wi‑Fi
        </h2>

        {loading ? (
          <div className="wifi-share-state">
            <Spinner />
            <p className="text-muted">Reading network details…</p>
          </div>
        ) : error ? (
          <div className="wifi-share-state">
            <p className="wifi-share-error">{error}</p>
          </div>
        ) : share ? (
          <>
            <p className="wifi-share-sub">Scan with a phone camera to join {share.ssid}.</p>
            <div className="wifi-share-qr">
              <img
                src={`data:image/svg+xml,${encodeURIComponent(share.qrSvg)}`}
                alt={`QR code to join the Wi‑Fi network ${share.ssid}`}
                width={200}
                height={200}
              />
            </div>
            <div className="wifi-share-rows">
              <CopyRow label="Network" value={share.ssid} />
              {share.password ? (
                <CopyRow label="Password" value={share.password} />
              ) : secured ? (
                <p className="wifi-share-note">
                  The saved password wasn&apos;t available. Scan the code to join, or enter the
                  password by hand.
                </p>
              ) : (
                <p className="wifi-share-note">This is an open network — no password needed.</p>
              )}
            </div>
            <p className="wifi-share-meta">{securityLabel(share)}</p>
          </>
        ) : null}

        <div className="wifi-share-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
