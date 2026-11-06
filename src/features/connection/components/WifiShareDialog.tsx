import type { ReactNode } from 'react'

import { ErrorNotice } from '@/app/components/ErrorNotice'
import { useWifiShare } from '@/features/connection/hooks/useWifiShare'
import { type ShareNotice, shareNotice } from '@/features/connection/utils/wifi-share-notice'
import type { WifiShare } from '@/types'
import { AlertIcon, Dialog, LockIcon, Spinner, WifiOffIcon } from '@/ui'

// Each state fades in as it replaces the last, while the dialog eases to its height.
const STATE = 'flex animate-fade-in flex-col items-center gap-12 py-16 text-center'

const NOTICE_ICONS = {
  'wifi-off': <WifiOffIcon size={20} />,
  lock: <LockIcon size={20} />,
  alert: <AlertIcon size={20} />,
} satisfies Record<ShareNotice['icon'], ReactNode>

/**
 * A QR code a phone can scan to join the current Wi-Fi; the passphrase is never
 * shown in plaintext. It sits behind an OS auth prompt, so the fetch can be slow
 * or come back without a password if the user declines.
 */
export function WifiShareDialog({ onClose }: { onClose: () => void }) {
  const { share, error, isLoading, retry } = useWifiShare()
  const notice = isLoading ? null : shareNotice(share, error)
  const qr = isLoading || notice ? null : share

  return (
    <Dialog
      title="Share Wi‑Fi"
      // Only true of the QR code, so a notice goes without it.
      description={notice ? undefined : 'Scan with a phone camera to join'}
      onClose={onClose}
      footnote={
        qr ? (
          <p className="type-heading-small animate-fade-in text-center leading-body-default wrap-anywhere text-primary">
            {qr.ssid}
          </p>
        ) : undefined
      }
    >
      {/* Announces the QR code or notice when it replaces the loading state. */}
      <div className="flex w-full flex-col items-center text-center" aria-live="polite" aria-busy={isLoading}>
        <ShareState isLoading={isLoading} notice={notice} qr={qr} onRetry={retry} />
      </div>
    </Dialog>
  )
}

/** The dialog's one current state: generating, a notice, or the QR code. */
function ShareState({
  isLoading,
  notice,
  qr,
  onRetry,
}: {
  isLoading: boolean
  notice: ShareNotice | null
  qr: WifiShare | null
  onRetry: () => void
}) {
  if (isLoading) {
    return (
      <div className={STATE}>
        <Spinner />
        {/* At the full-page loading label's size, not a step larger. */}
        <p className="type-body-small text-tertiary">Generating QR code…</p>
      </div>
    )
  }
  if (notice) {
    return (
      <div className={STATE} role="alert">
        <ErrorNotice
          icon={NOTICE_ICONS[notice.icon]}
          title={notice.title}
          description={notice.description}
          size="dialog"
          onRetry={onRetry}
        />
      </div>
    )
  }
  if (!qr) return null
  return (
    // A white plate, so the QR keeps its quiet zone and contrast in dark mode.
    <div className="flex animate-fade-in justify-center rounded-lg border border-line bg-[#ffffff] p-16">
      <img
        className="block size-[240px]"
        src={`data:image/svg+xml,${encodeURIComponent(qr.qrSvg)}`}
        alt={`QR code to join the Wi‑Fi network ${qr.ssid}`}
        width={240}
        height={240}
      />
    </div>
  )
}
