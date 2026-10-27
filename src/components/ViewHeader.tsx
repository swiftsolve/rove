import type { ReactNode } from 'react'
import { cva } from 'class-variance-authority'
import { cx } from '@/lib/cx'
import './ViewHeader.css'

const subtitleVariants = cva('view-header-sub', {
  variants: {
    /** Runs the fade-in once (class swap → animation). */
    isSubtitleShown: { true: 'show' },
  },
  defaultVariants: { isSubtitleShown: false },
})

interface ViewHeaderProps {
  /** Nav-matched glyph shown in the rounded chip, e.g. `<DevicesIcon size={18} />`. */
  icon: ReactNode
  title: ReactNode
  /**
   * Subtitle line under the title. Omit to collapse the slot entirely (the
   * title then centres alone); when rendered, the slot reserves its line height
   * so the title never shifts as the content resolves.
   */
  subtitle?: ReactNode
  /** Extra class for view-specific subtitle layout (gaps, truncation). */
  subtitleClassName?: string
  /** Toggling this on runs the subtitle's fade-in once (class swap → animation). */
  isSubtitleShown?: boolean
  /** Controls grouped at the header's end (refresh/help buttons, actions). */
  actions?: ReactNode
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
  isSubtitleShown,
  actions,
}: ViewHeaderProps): JSX.Element {
  return (
    <div className="view-header view-header-row">
      <span className="view-header-icon">{icon}</span>
      <div className="view-header-text">
        <h1 className="view-header-title">{title}</h1>
        {subtitle !== undefined && (
          <span className={cx(subtitleVariants({ isSubtitleShown }), subtitleClassName)}>{subtitle}</span>
        )}
      </div>
      {actions !== undefined && <div className="view-header-actions">{actions}</div>}
    </div>
  )
}
