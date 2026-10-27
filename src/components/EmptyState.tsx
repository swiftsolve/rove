import type { ReactNode } from 'react'

interface IconProps {
  size?: number
  className?: string
}

interface EmptyStateProps {
  /** Glyph above the title — any alias from `Icons`, drawn at the shared size. */
  icon: (props: IconProps) => JSX.Element
  title: string
  /** A line or two naming what will fill the page, or why it can't. */
  hint?: ReactNode
  /** Control below the hint, usually a retry button. */
  action?: ReactNode
}

/**
 * The shared "nothing here yet" page: a muted glyph, a title, a short
 * explanation and an optional action, centred in the content region. Every
 * view's blank state goes through this so they line up on one icon size, one
 * rhythm and one measure.
 */
export function EmptyState({ icon: Icon, title, hint, action }: EmptyStateProps): JSX.Element {
  return (
    // `.view-empty` lays out the page; its gap is opened up here, and the action
    // button is nudged down from the copy above it.
    <div className="view-empty gap-16 text-center [&>button]:mt-4">
      <Icon size={32} className="text-tertiary opacity-55" />
      {/* An h2 for the page outline, at the plain weight of the paragraph it replaced. */}
      <h2 className="text-md [font-weight:inherit] text-(--text-secondary)">{title}</h2>
      {hint != null && <EmptyStateHint>{hint}</EmptyStateHint>}
      {action}
    </div>
  )
}

/** A line of explanation under the title — also for extra notes an `action` adds. */
export function EmptyStateHint({
  children,
  role,
}: {
  children: ReactNode
  /** `status` for a note that appears in answer to an action, so it's announced. */
  role?: 'status'
}): JSX.Element {
  return (
    <p className="max-w-[42ch] text-sm leading-[1.45] text-tertiary" role={role}>
      {children}
    </p>
  )
}
