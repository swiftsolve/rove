import { useMutation } from '@tanstack/react-query'

import type { PendingUpdate } from '@/app/utils/updater'
import { Button } from '@/ui'

/** Installs an update found by "Check now": busy while it downloads, and offers a retry if it fails. */
export function InstallUpdateButton({ update }: { update: PendingUpdate }) {
  // install() ends in relaunch(), so it never resolves on success; only a
  // failure returns control here.
  const install = useMutation({
    mutationFn: () => update.install(),
    onError: (err) => console.warn('Update install failed:', err),
  })

  return (
    <Button onClick={() => install.mutate()} isLoading={install.isPending}>
      {install.isPending ? 'Installing…' : install.isError ? 'Try again' : 'Install & restart'}
    </Button>
  )
}
