import { useState } from 'react'

import { WifiShareDialog } from '@/features/connection/components/WifiShareDialog'
import { DialogRoot, IconButton, QrCodeIcon } from '@/ui'

/**
 * A QR button that opens the Wi-Fi share dialog, shown beside the signal meter
 * in the Home connection card. Mount it only when the active connection is
 * Wi-Fi — there's nothing to share over Ethernet.
 */
export function ShareWifiButton() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <IconButton label="Share Wi‑Fi" icon={QrCodeIcon} onClick={() => setIsOpen(true)} />
      <DialogRoot isOpen={isOpen}>
        <WifiShareDialog onClose={() => setIsOpen(false)} />
      </DialogRoot>
    </>
  )
}
