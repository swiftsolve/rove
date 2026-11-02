import type { ReactNode } from 'react'
import { cx } from 'class-variance-authority'
import type { WifiShare } from '@/types'
import { useWifiShare } from '@/features/connection/hooks/useWifiShare'
import { AlertIcon, Button, Dialog, LockIcon, RefreshIcon, Spinner, WifiOffIcon } from '@/ui'

const STATE = 'flex flex-col items-center gap-12 py-16 text-center'

/** The red icon chip over a notice. */
const CHIP = cx(
  'inline-flex size-[40px] items-center justify-center rounded-full text-status-negative',
  'bg-[color-mix(in_srgb,var(--status-negative)_var(--opacity-tint-sm),transparent)]',
)

interface Notice {
  icon: ReactNode
  title: string
  description: string
}

/** The backend's error, as a title and a line of help. */
function describeShareError(message: string): Notice {
  if (/not connected/i.test(message)) {
    return { icon: <WifiOffIcon size={20} />, title: 'Not on Wi‑Fi', description: 'Connect to a Wi‑Fi network to share it.' }
  }
  if (/name is unavailable/i.test(message)) {
    // macOS withholds the SSID without Location Services, so point there
    // without asserting it.
    return {
      icon: <WifiOffIcon size={20} />,
      title: 'Network name hidden',
      description: 'Your system withheld it. On a Mac, check Location Services.',
    }
  }
  return { icon: <AlertIcon size={20} />, title: 'Couldn’t make a QR code', description: message }
}

const MISSING_PASSWORD: Notice = {
  icon: <LockIcon size={20} />,
  title: 'Password not available',
  description: 'Allow access when asked, so the code can include it.',
}

function ShareNotice({ notice, onRetry }: { notice: Notice; onRetry: () => void }): JSX.Element {
  return (
    <div className={STATE} role="alert">
      <span className={CHIP} aria-hidden>
        {notice.icon}
      </span>
      <div className="flex flex-col items-center gap-4">
        <p className="text-lg font-semibold text-primary">{notice.title}</p>
        <p className="max-w-[260px] text-sm text-tertiary">{notice.description}</p>
      </div>
      <Button icon={RefreshIcon} onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

/** The notice to show instead of the QR code, if any. */
function shareNotice(share: WifiShare | null, error: string | null): Notice | null {
  if (error) return describeShareError(error)
  if (share && share.encryption !== 'nopass' && !share.password) return MISSING_PASSWORD
  return null
}

/**
 * Modal that turns the current Wi-Fi connection into a scannable QR code. The
 * passphrase is encoded in the QR so a phone can join by scanning, but it's
 * never shown in plaintext. Fetches the payload from the backend on open and on
 * Try again; the passphrase is read behind an OS auth prompt, so the fetch can
 * take a moment (or come back without a password if the user declines).
 */
export function WifiShareDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const { share, error, isLoading, retry } = useWifiShare()
  const notice = isLoading ? null : shareNotice(share, error)
  const qr = isLoading || notice ? null : share

  return (
    <Dialog
      title="Share Wi‑Fi"
      // Only true of the QR code, so a notice goes without it.
      description={notice ? undefined : 'Scan with a phone camera to join'}
      onClose={onClose}
      bodyClassName="flex flex-col items-center text-center"
      footnote={
        qr ? <p className="text-center text-lg font-semibold text-primary wrap-anywhere">{qr.ssid}</p> : undefined
      }
    >
      {/* Live, so the QR code or a notice is announced when it replaces the
          loading state. */}
      <div className="flex w-full flex-col items-center" aria-live="polite" aria-busy={isLoading}>
        {isLoading ? (
          <div className={STATE}>
            <Spinner />
            {/* At the full-page loading label's size, not a step larger. */}
            <p className="type-body-default text-tertiary text-sm">Generating QR code…</p>
          </div>
        ) : notice ? (
          <ShareNotice notice={notice} onRetry={retry} />
        ) : qr ? (
          // A white plate, so the QR keeps its quiet zone and contrast in dark mode.
          <div className="flex justify-center rounded-lg border border-line bg-[#ffffff] p-16">
            <img
              className="block size-[240px]"
              src={`data:image/svg+xml,${encodeURIComponent(qr.qrSvg)}`}
              alt={`QR code to join the Wi‑Fi network ${qr.ssid}`}
              width={240}
              height={240}
            />
          </div>
        ) : null}
      </div>
    </Dialog>
  )
}
