import { useEffect, useState } from 'react'
import type { WifiShare } from '@/types'
import { getNetworkApi } from '@/bridge/networkApi'
import { CloseIcon } from '@/components/ui/Icons'
import { Spinner } from '@/components/ui/Spinner'
import './WifiShareDialog.css'

/**
 * Modal that turns the current Wi-Fi connection into a scannable QR code. The
 * passphrase is encoded in the QR so a phone can join by scanning, but it's
 * never shown in plaintext. Fetches the payload from the backend on open; the
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
        <div className="wifi-share-header">
          <h2 id="wifi-share-title" className="wifi-share-title">
            Share Wi‑Fi
          </h2>
          <button
            type="button"
            className="btn-icon btn-icon-secondary wifi-share-close"
            aria-label="Close"
            onClick={onClose}
          >
            <CloseIcon size={15} />
          </button>
        </div>

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
          <div className="wifi-share-body">
            <p className="wifi-share-sub">Scan with a phone camera to join</p>
            <div className="wifi-share-qr">
              <img
                src={`data:image/svg+xml,${encodeURIComponent(share.qrSvg)}`}
                alt={`QR code to join the Wi‑Fi network ${share.ssid}`}
                width={260}
                height={260}
              />
            </div>
            <p className="wifi-share-ssid">{share.ssid}</p>
            {secured && !share.password && (
              <p className="wifi-share-note">
                The saved password wasn&apos;t available, so scanning will prompt for it.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
