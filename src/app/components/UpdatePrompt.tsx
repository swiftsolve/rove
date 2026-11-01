import { UpdateDialog } from '@/app/components/UpdateDialog'
import { useUpdateCheck } from '@/app/hooks/useUpdateCheck'
import { DialogRoot } from '@/ui'

/** Checks for a newer release after launch and, if one exists, offers it. */
export function UpdatePrompt(): JSX.Element | null {
  const { pendingUpdate, isDismissed, dismissUpdate } = useUpdateCheck()
  if (!pendingUpdate) return null
  return (
    <DialogRoot isOpen={!isDismissed}>
      <UpdateDialog update={pendingUpdate} onDismiss={dismissUpdate} />
    </DialogRoot>
  )
}
