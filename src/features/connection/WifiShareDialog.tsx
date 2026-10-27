import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { WifiShare } from '@/types'
import { getNetworkApi } from '@/bridge/networkApi'
import { CloseIcon } from '@/components/icons/Icons'
import { Spinner } from '@/components/Spinner'
import { IconButton } from '@/components/IconButton'
import styles from './WifiShareDialog.module.css'

interface ShareBodyProps {
  share: WifiShare | null
  error: string | null
  isLoading: boolean
}

/** Loading, then an error, a missing-password note, or the QR code itself. */
function ShareBody({ share, error, isLoading }: ShareBodyProps): JSX.Element | null {
  if (isLoading) {
    return (
      <div className={styles.state}>
        <Spinner />
        <p className="text-muted">Generating QR code…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.state}>
        <p className={styles.error}>{error}</p>
      </div>
    )
  }

  if (!share) return null

  const isSecured = share.encryption !== 'nopass'
  if (isSecured && !share.password) {
    return (
      <div className={styles.state}>
        <p className={styles.note}>
          The saved password for {share.ssid ?? 'this network'} wasn&apos;t available, so
          there&apos;s no complete QR code to scan. Try again to allow access when prompted.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className={styles.qr}>
        <img
          src={`data:image/svg+xml,${encodeURIComponent(share.qrSvg)}`}
          alt={`QR code to join the Wi‑Fi network ${share.ssid}`}
          width={240}
          height={240}
        />
      </div>
      <p className={styles.ssid}>{share.ssid}</p>
    </>
  )
}

/**
 * Modal that turns the current Wi-Fi connection into a scannable QR code. The
 * passphrase is encoded in the QR so a phone can join by scanning, but it's
 * never shown in plaintext. Fetches the payload from the backend on open; the
 * passphrase is read behind an OS auth prompt, so the fetch can take a moment
 * (or come back without a password if the user declines).
 */
export function WifiShareDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const [share, setShare] = useState<WifiShare | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isCancelled = false
    getNetworkApi()
      .getWifiShare()
      .then((result) => {
        if (!isCancelled) setShare(result)
      })
      .catch((cause: unknown) => {
        if (!isCancelled) setError(cause instanceof Error ? cause.message : String(cause))
      })
      .finally(() => {
        if (!isCancelled) setIsLoading(false)
      })
    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const overlay = (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wifi-share-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.head}>
          <div className={styles.heading}>
            <h2 id="wifi-share-title" className={styles.title}>
              Share Wi‑Fi
            </h2>
            <p className={styles.sub}>Scan with a phone camera to join</p>
          </div>
          <IconButton
            className={styles.close}
            aria-label="Close"
            onClick={onClose}
          >
            <CloseIcon size={15} />
          </IconButton>
        </header>

        <div className={styles.body}>
          <ShareBody share={share} error={error} isLoading={isLoading} />
        </div>
      </div>
    </div>
  )

  // Anchor the modal to the main content column so it centres over the page
  // area, not the whole window (the nav rail stays uncovered). Fall back to
  // inline rendering if the column isn't in the DOM.
  const host = typeof document !== 'undefined' ? document.querySelector('[data-modal-root]') : null
  return host ? createPortal(overlay, host) : overlay
}
