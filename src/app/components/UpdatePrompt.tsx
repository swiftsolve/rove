import { UpdateDialog } from '@/app/components/UpdateDialog'
import { useUpdateCheck } from '@/app/hooks/useUpdateCheck'
import { DIALOG_EXIT_MS } from '@/components/Dialog'
import { usePresence } from '@/hooks/usePresence'

/** Checks for a newer release after launch and, if one exists, offers it. */
export function UpdatePrompt(): JSX.Element | null {
  const { pendingUpdate, isDismissed, dismissUpdate } = useUpdateCheck()
  const isOpen = pendingUpdate != null && !isDismissed
  // Mounted through the dialog's leave animation.
  const isMounted = usePresence(isOpen, DIALOG_EXIT_MS)
  if (!pendingUpdate || !isMounted) return null
  return <UpdateDialog isOpen={isOpen} update={pendingUpdate} onDismiss={dismissUpdate} />
}
