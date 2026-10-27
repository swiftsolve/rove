import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { cx } from 'class-variance-authority'
import type { WifiShare } from '@/types'
import { getNetworkApi } from '@/bridge/networkApi'
import { CloseIcon } from '@/components/icons/Icons'
import { Spinner } from '@/components/Spinner'
import { IconButton } from '@/components/IconButton'
import { useModalFocus } from '@/hooks/useModalFocus'
import styles from './WifiShareDialog.module.css'

const STATE = 'flex flex-col items-center gap-12 py-16 text-center'

interface ShareBodyProps {
  share: WifiShare | null
  error: string | null
  isLoading: boolean
}

/** Loading, then an error, a missing-password note, or the QR code itself. */
function ShareBody({ share, error, isLoading }: ShareBodyProps): JSX.Element | null {
  if (isLoading) {
    return (
      <div className={STATE}>
        <Spinner />
        {/* At the full-page loading label's size, not a step larger. */}
        <p className="text-muted text-sm">Generating QR code…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className={STATE}>
        <p className="text-sm text-(--text-secondary)" role="alert">
          {error}
        </p>
      </div>
    )
  }

  if (!share) return null

  const isSecured = share.encryption !== 'nopass'
  if (isSecured && !share.password) {
    return (
      <div className={STATE}>
        <p className="mt-12 text-xs text-tertiary">
          The saved password for {share.ssid ?? 'this network'} wasn&apos;t available, so
          there&apos;s no complete QR code to scan. Try again to allow access when prompted.
        </p>
      </div>
    )
  }

  return (
    <>
      {/* A white plate, so the QR keeps its quiet zone and contrast in dark mode. */}
      <div className="flex justify-center mb-12 p-16 bg-[#ffffff] border border-line-strong rounded-lg">
        <img
          className="block size-[240px]"
          src={`data:image/svg+xml,${encodeURIComponent(share.qrSvg)}`}
          alt={`QR code to join the Wi‑Fi network ${share.ssid}`}
          width={240}
          height={240}
        />
      </div>
      <p className="text-lg font-semibold text-primary wrap-anywhere">{share.ssid}</p>
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

  // Focus stays in the dialog while it's open; Escape closes it.
  const dialogRef = useModalFocus(onClose)

  const overlay = (
    // Absolute (not fixed) and portaled into the content column
    // ([data-modal-root]), so it covers and centres over the main content area
    // rather than the whole window. Same sectioned shell as the Add service
    // dialog: the header and body own their insets, and the shell clips the
    // recessed body's square corners to its radius.
    <div
      className={cx(
        styles.overlay,
        'absolute inset-[0] z-90 flex items-center justify-center p-20 bg-scrim',
      )}
      role="presentation"
      onClick={onClose}
    >
      <div
        className={cx(
          styles.dialog,
          'w-full max-w-[340px] overflow-hidden',
          'bg-panel border border-line-strong rounded-lg shadow-raised',
        )}
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wifi-share-title"
        aria-describedby="wifi-share-sub"
        onClick={(event) => event.stopPropagation()}
      >
        {/* The darker body below sets the header apart, so it needs no divider. */}
        <div className="flex items-start justify-between gap-8 p-16">
          <div className="min-w-[0]">
            <h2
              id="wifi-share-title"
              className="text-xl font-semibold tracking-[-0.01em] text-primary"
            >
              Share Wi‑Fi
            </h2>
            <p id="wifi-share-sub" className="mt-4 text-sm text-(--text-secondary)">
              Scan with a phone camera to join
            </p>
          </div>
          {/* Pulled toward the panel's corner without cramping the title. The
              secondary look, but blending into the header with no fill of its own
              at rest. */}
          <IconButton
            tone="plain"
            className={cx(
              'shrink-0 -mt-4 -mr-4 text-(--text-secondary)',
              'not-disabled:not-aria-disabled:hover:bg-hover not-disabled:not-aria-disabled:hover:text-primary',
            )}
            aria-label="Close"
            onClick={onClose}
          >
            <CloseIcon size={15} />
          </IconButton>
        </div>

        {/* A recessed well framing the QR. Live, so the QR code, note or error
            is announced when it replaces the loading state. */}
        <div
          className="flex flex-col items-center p-16 text-center bg-chrome"
          aria-live="polite"
          aria-busy={isLoading}
        >
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
