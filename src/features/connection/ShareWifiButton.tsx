import { useState } from 'react'
import { QrCodeIcon } from '@/components/icons/Icons'
import { WifiShareDialog } from '@/features/connection/WifiShareDialog'
import { IconButton } from '@/components/IconButton'
import { DialogRoot } from '@/components/Dialog'

/**
 * A QR button that opens the Wi-Fi share dialog, shown beside the signal meter
 * in the Home connection card. Mount it only when the active connection is
 * Wi-Fi — there's nothing to share over Ethernet.
 */
export function ShareWifiButton(): JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  // Mounted through the dialog's leave animation.

  return (
    <>
      <IconButton label="Share Wi‑Fi" icon={QrCodeIcon} onClick={() => setIsOpen(true)} />
      <DialogRoot isOpen={isOpen}>
        <WifiShareDialog onClose={() => setIsOpen(false)} />
      </DialogRoot>
    </>
  )
}
