import { useState } from 'react'
import { QrCodeIcon } from '@/components/ui/Icons'
import { Tooltip } from '@/components/ui/Tooltip'
import WifiShareDialog from './WifiShareDialog'

/**
 * A QR button that opens the Wi-Fi share dialog, shown beside the signal meter
 * in the Home connection card. Mount it only when the active connection is
 * Wi-Fi — there's nothing to share over Ethernet.
 */
export default function ShareWifiButton(): JSX.Element {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Tooltip content="Share Wi‑Fi">
        <button
          type="button"
          className="btn-icon btn-icon-secondary"
          aria-label="Share Wi‑Fi"
          onClick={() => setOpen(true)}
        >
          <QrCodeIcon size={16} />
        </button>
      </Tooltip>
      {open && <WifiShareDialog onClose={() => setOpen(false)} />}
    </>
  )
}
