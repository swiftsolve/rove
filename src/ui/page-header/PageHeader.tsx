import type { ReactNode } from 'react'
import { cx } from 'class-variance-authority'
import { ArrowLeftIcon } from '../icons/Icons'

// The back button in the icon chip's slot: the same box (a rail item's, 10px
// radius), so a subpage's header reads like a top-level page's.
const BACK = cx(
  'inline-flex size-(--rail-item-size) shrink-0 items-center justify-center rounded-md',
  'bg-fill-subtle text-secondary hover:bg-hover hover:text-primary',
  'transition-[color,background] duration-(--duration-fast) ease-in-out',
)

// Reserves a line's height even while it's empty, so the title above never
// shifts as the line fills in.
const LINE = 'min-h-[calc(var(--font-size-xs)*1.35)] text-xs text-tertiary'

type PageHeaderProps = {
  title: ReactNode
  /**
   * The line under the title. It fades in when it first shows, and again each
   * time `status` clears. `null` keeps the line's height while there's nothing
   * to show; leave it out to have no line.
   */
  description?: ReactNode
  /** Shown in the description's place while something loads or runs ("Checking…"). */
  status?: ReactNode
  /** Controls at the end of the header (help, refresh, the page's main action). */
  actions?: ReactNode
} & (
  // Exactly one of `icon` or `onBack`: each branch types the other as `never`,
  // so passing both is an error.
  | {
      /** The page's nav icon, in a chip: a top-level page. */
      icon: ReactNode
      onBack?: never
    }
  | {
      /** A back button in the chip's place: a page layered over a tab. */
      onBack: () => void
      icon?: never
    }
)

/**
 * The top of every page but Home: an icon chip (or a back button), the title
 * with a line under it, and actions at the end, over a full-width divider. It
 * sits above the page content (z-20), so its tooltips aren't painted over by
 * the content they drop into. The actions hold their size, so a long
 * description wraps instead of squeezing them.
 */
export function PageHeader({ title, description, status, actions, icon, onBack }: PageHeaderProps): JSX.Element {
  const hasLine = description !== undefined || status !== undefined
  return (
    <header className="page-header relative z-20 flex items-center gap-12">
      {onBack ? (
        <button type="button" className={BACK} onClick={onBack} aria-label="Back">
          <ArrowLeftIcon size={18} />
        </button>
      ) : (
        <span className="page-header-icon" aria-hidden>
          {icon}
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <h1 className="page-header-title">{title}</h1>
        {hasLine && (
          <div className={LINE}>
            {/* Keyed, so the description mounts afresh (and fades in) when the status clears. */}
            {status !== undefined ? (
              <span key="status">{status}</span>
            ) : (
              <div key="description" className="animate-fade-in">
                {description}
              </div>
            )}
          </div>
        )}
      </div>
      {actions !== undefined && <div className="flex shrink-0 items-center gap-6">{actions}</div>}
    </header>
  )
}
