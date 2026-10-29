import { useState } from 'react'
import { QrCodeIcon } from '@/components/icons/Icons'
import { Tooltip } from '@/components/Tooltip'
import { WifiShareDialog } from '@/features/connection/WifiShareDialog'
import { IconButton } from '@/components/IconButton'
import { DIALOG_EXIT_MS } from '@/components/Dialog'
import { usePresence } from '@/hooks/usePresence'

/**
 * A QR button that opens the Wi-Fi share dialog, shown beside the signal meter
 * in the Home connection card. Mount it only when the active connection is
 * Wi-Fi — there's nothing to share over Ethernet.
 */
export function ShareWifiButton(): JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  // Mounted through the dialog's leave animation.
  const isMounted = usePresence(isOpen, DIALOG_EXIT_MS)

  return (
    <>
      <Tooltip content="Share Wi‑Fi">
        <IconButton
          aria-label="Share Wi‑Fi"
          onClick={() => setIsOpen(true)}
        >
          <QrCodeIcon size={16} />
        </IconButton>
      </Tooltip>
      {isMounted && <WifiShareDialog isOpen={isOpen} onClose={() => setIsOpen(false)} />}
    </>
  )
}
