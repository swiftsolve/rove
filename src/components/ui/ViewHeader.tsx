import type { ReactNode } from 'react'
import './ViewHeader.css'

interface ViewHeaderProps {
  /** Nav-matched glyph shown in the rounded chip, e.g. `<DevicesIcon size={18} />`. */
  readonly icon: ReactNode
  readonly title: ReactNode
  /**
   * Subtitle line under the title. Omit to collapse the slot entirely (the
   * title then centres alone); when rendered, the slot reserves its line height
   * so the title never shifts as the content resolves.
   */
  readonly subtitle?: ReactNode
  /** Extra class for view-specific subtitle layout (gaps, truncation). */
  readonly subtitleClassName?: string
  /** Toggling this on runs the subtitle's fade-in once (class swap → animation). */
  readonly subtitleShown?: boolean
  /** Controls grouped at the header's end (refresh/help buttons, actions). */
  readonly actions?: ReactNode
}

/**
 * Shared page header for the top-level views: icon tile, title with an
 * optional fade-in subtitle beneath it, and action controls on the right.
 * The `.view-header` frame (edge-to-edge divider) comes from index.css.
 */
export function ViewHeader({
  icon,
  title,
  subtitle,
  subtitleClassName,
  subtitleShown = false,
  actions,
}: ViewHeaderProps): JSX.Element {
  const subClass = [
    'view-header-sub',
    subtitleClassName,
    subtitleShown ? 'show' : undefined,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="view-header view-header-row">
      <span className="view-header-icon">{icon}</span>
      <div className="view-header-text">
        <span className="view-header-title">{title}</span>
        {subtitle !== undefined && <span className={subClass}>{subtitle}</span>}
      </div>
      {actions !== undefined && <div className="view-header-actions">{actions}</div>}
    </div>
  )
}
