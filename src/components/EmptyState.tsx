import type { ReactNode } from 'react'
import { cx } from 'class-variance-authority'
import styles from './EmptyState.module.css'

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
    <div className={cx('view-empty', styles.root)}>
      <Icon size={32} className={styles.icon} />
      <h2 className={styles.title}>{title}</h2>
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
    <p className={styles.hint} role={role}>
      {children}
    </p>
  )
}
