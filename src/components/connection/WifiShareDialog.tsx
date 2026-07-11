import { useEffect, useState } from 'react'
import type { WifiShare } from '@/types'
import { getNetworkApi } from '@/bridge/networkApi'
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
            {secured && !share.password && (
              <p className="wifi-share-note">
                The saved password wasn&apos;t available, so scanning will prompt for it. Enter it
                by hand to join.
              </p>
            )}
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
