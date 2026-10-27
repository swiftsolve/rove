import type { ReactNode } from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/cn'

// Reserves the subtitle line's height even while it only holds a status
// placeholder, so the title above never shifts when the real content resolves.
const subtitleVariants = cva('page-header-sub min-h-[calc(var(--font-size-xs)*1.35)] text-xs text-tertiary', {
  variants: {
    /** Runs the fade-in once (class swap → animation). */
    isSubtitleShown: { true: 'animate-fade-in' },
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
  /** Extra class for a view's own subtitle layout (gaps, truncation). */
  subtitleClassName?: string
  /** Toggling this on runs the subtitle's fade-in once (class swap → animation). */
  isSubtitleShown?: boolean
  /** Controls grouped at the header's end (refresh/help buttons, actions). */
  actions?: ReactNode
}

/**
 * Shared page header for the top-level views: icon tile, title with an
 * optional fade-in subtitle beneath it, and action controls on the right, over
 * the `page-header` frame's edge-to-edge divider. It sits above the view
 * content (z-20), so its tooltips aren't painted over by the later siblings
 * they drop into. The actions hold their size, so a long subtitle wraps in the
 * text column instead of squeezing them.
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
    <header className="page-header page-header-row relative z-20 flex items-center gap-12">
      <span className="page-header-icon" aria-hidden>
        {icon}
      </span>
      <div className="page-header-text flex min-w-0 flex-1 flex-col gap-4">
        <h1 className="page-header-title">{title}</h1>
        {subtitle !== undefined && (
          <span className={cn(subtitleVariants({ isSubtitleShown }), subtitleClassName)}>{subtitle}</span>
        )}
      </div>
      {actions !== undefined && (
        <div className="page-header-actions flex shrink-0 items-center gap-4">{actions}</div>
      )}
    </header>
  )
}
