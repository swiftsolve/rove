import { UpdateDialog } from '@/app/components/UpdateDialog'
import { useUpdateCheck } from '@/app/hooks/useUpdateCheck'

/** Checks for a newer release after launch and, if one exists, offers it. */
export function UpdatePrompt(): JSX.Element | null {
  const { pendingUpdate, dismissUpdate } = useUpdateCheck()
  if (!pendingUpdate) return null
  return <UpdateDialog update={pendingUpdate} onDismiss={dismissUpdate} />
}
