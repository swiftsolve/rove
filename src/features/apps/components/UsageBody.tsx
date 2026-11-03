import type { ReactNode } from 'react'

import { RestartAsAdminAction } from '@/features/apps/components/RestartAsAdminAction'
import type { AppUsageSupport } from '@/types'
import { EmptyState, LoadingState } from '@/ui'

/** What a usage view says in each state before it has rows to show. */
export type UsageBodyCopy = {
  /** Why the view needs administrator access, on Windows. */
  unsupported: string
  loading: string
  emptyTitle: string
  empty: string
}

type UsageBodyProps = {
  support: AppUsageSupport
  isFirstLoad: boolean
  isEmpty: boolean
  copy: UsageBodyCopy
  /** The list, shown once there are rows. */
  children: ReactNode
}

/** A usage view's body: the admin prompt, a first-load spinner, an empty state, or the list. */
export function UsageBody({ support, isFirstLoad, isEmpty, copy, children }: UsageBodyProps) {
  if (support === 'unsupported') {
    return (
      <EmptyState
        isLocked
        title="Administrator access needed"
        description={copy.unsupported}
        actions={<RestartAsAdminAction />}
      />
    )
  }
  if (isFirstLoad) {
    return <LoadingState label={copy.loading} />
  }
  if (isEmpty) {
    return <EmptyState title={copy.emptyTitle} description={copy.empty} />
  }
  return <>{children}</>
}
