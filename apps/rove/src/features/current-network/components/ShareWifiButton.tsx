import { DialogRoot, IconButton, QrCodeIcon } from '@swiftsolve/rove-ui'
import { useState } from 'react'

import { WifiShareDialog } from '@/features/current-network/components/WifiShareDialog'

/** A QR button that opens the Wi-Fi share dialog. Mount it only on Wi-Fi: there's nothing to share over Ethernet. */
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
