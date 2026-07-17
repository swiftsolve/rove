import type { ReactNode } from 'react'
import './EmptyState.css'

interface IconProps {
  readonly size?: number
  readonly className?: string
}

interface EmptyStateProps {
  /** Glyph above the title — any alias from `Icons`, drawn at the shared size. */
  readonly icon: (props: IconProps) => JSX.Element
  readonly title: string
  /** A line or two naming what will fill the page, or why it can't. */
  readonly hint?: ReactNode
  /** Control below the hint, usually a retry button. */
  readonly action?: ReactNode
}

/**
 * The shared "nothing here yet" page: a muted glyph, a title, a short
 * explanation and an optional action, centred in the content region. Every
 * view's blank state goes through this so they line up on one icon size, one
 * rhythm and one measure.
 */
export function EmptyState({ icon: Icon, title, hint, action }: EmptyStateProps): JSX.Element {
  return (
    <div className="view-empty empty-state">
      <Icon size={32} className="empty-state-icon" />
      <p className="empty-state-title">{title}</p>
      {hint != null && <p className="empty-state-hint">{hint}</p>}
      {action}
    </div>
  )
}
