import { useState } from 'react'
import { QrCodeIcon } from '@/components/icons/Icons'
import { Tooltip } from '@/components/Tooltip'
import { WifiShareDialog } from '@/features/connection/WifiShareDialog'

/**
 * A QR button that opens the Wi-Fi share dialog, shown beside the signal meter
 * in the Home connection card. Mount it only when the active connection is
 * Wi-Fi — there's nothing to share over Ethernet.
 */
export function ShareWifiButton(): JSX.Element {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <Tooltip content="Share Wi‑Fi">
        <button
          type="button"
          className="btn-icon btn-icon-secondary"
          aria-label="Share Wi‑Fi"
          onClick={() => setIsOpen(true)}
        >
          <QrCodeIcon size={16} />
        </button>
      </Tooltip>
      {isOpen && <WifiShareDialog onClose={() => setIsOpen(false)} />}
    </>
  )
}
