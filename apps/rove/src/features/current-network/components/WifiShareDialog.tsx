import { AlertIcon, Dialog, LockIcon, Spinner, WifiOffIcon } from '@swiftsolve/rove-ui'
import type { ReactNode } from 'react'

import { ErrorNotice } from '@/app/components/ErrorNotice'
import { WifiQrCode } from '@/features/current-network/components/WifiQrCode'
import { useWifiShare } from '@/features/current-network/hooks/useWifiShare'
import { type ShareNotice, shareNotice } from '@/features/current-network/utils/wifi-share-notice'
import type { WifiShare } from '@/types'

/** Each state fades in as it replaces the last, while the dialog eases to its height. */
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
  const shareForQrCode = isLoading || notice ? null : share

  return (
    <Dialog
      title="Share Wi‑Fi"
      // Only true of the QR code, so a notice goes without it.
      description={notice ? undefined : 'Scan with a phone camera to join'}
      onClose={onClose}
      footnote={
        shareForQrCode ? (
          <p className="type-heading animate-fade-in text-center leading-body wrap-anywhere text-primary">
            {shareForQrCode.ssid}
          </p>
        ) : undefined
      }
    >
      {/* Announces the QR code or notice when it replaces the loading state. */}
      <div className="flex w-full flex-col items-center text-center" aria-live="polite" aria-busy={isLoading}>
        <ShareState isLoading={isLoading} notice={notice} shareForQrCode={shareForQrCode} onRetry={retry} />
      </div>
    </Dialog>
  )
}

/** The dialog's one current state: generating, a notice, or the QR code. */
function ShareState({
  isLoading,
  notice,
  shareForQrCode,
  onRetry,
}: {
  isLoading: boolean
  notice: ShareNotice | null
  shareForQrCode: WifiShare | null
  onRetry: () => void
}) {
  if (isLoading) {
    return (
      <div className={STATE}>
        <Spinner />
        {/* At the full-page loading label's size, not a step larger. */}
        <p className="type-body text-tertiary">Generating QR code…</p>
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
  if (!shareForQrCode) return null
  return <WifiQrCode svg={shareForQrCode.qrSvg} alt={`QR code to join the Wi‑Fi network ${shareForQrCode.ssid}`} />
}
