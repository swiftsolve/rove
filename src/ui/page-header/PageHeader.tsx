import { cx } from 'class-variance-authority'
import type { ReactNode } from 'react'

import { IconButton } from '../button/IconButton'
import { ArrowLeftIcon, InfoIcon } from '../icons/Icons'
import { ScreenReaderStatus } from '../screen-reader/ScreenReaderStatus'
import { Tooltip } from '../tooltip/Tooltip'
import { LAYER_RAISED } from '../utils/layers'
import { PRESS } from '../utils/pressable'

// The back button in the icon chip's slot: the same box (a rail item's, 10px
// radius), so a subpage's header reads like a top-level page's.
const BACK = cx(
  'inline-flex size-(--rail-item-size) shrink-0 items-center justify-center rounded-md',
  'bg-overlay-subtle text-secondary hover:bg-hover hover:text-primary',
  'transition-[color,background,transform] duration-(--duration-fast) ease-in-out',
  PRESS,
)

// Reserves a line's height even while it's empty, so the title above never
// shifts as the line fills in.
const LINE = 'min-h-[calc(var(--font-size-xs)*1.35)] type-caption text-tertiary'

// One height on every page, an icon button's: beside a taller button a line
// its full height reads longer than it, as the button's corners round off.
const DIVIDER = 'h-[28px] w-px shrink-0 bg-line'

type PageHeaderProps = {
  /** The page's name. */
  title: ReactNode
  /**
   * The line under the title. It fades in when it first shows, and again each
   * time `status` clears. `null` keeps the line's height while there's nothing
   * to show; leave it out to have no line.
   */
  description?: ReactNode
  /** Shown in the description's place while something loads or runs ("Checking…"). */
  status?: ReactNode
  /** The page's controls (its main action, refresh), at the header's end. */
  actions?: ReactNode
  /** An info button before the actions, past a divider, never among them: its name and hint. */
  info?: { label: string; hint: ReactNode }
} &
  // Exactly one of `icon` or `onBack`: each branch types the other as `never`,
  // so passing both is an error.
  (
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
 * with a line under it, an info button, then a divider and the actions at the
 * end, over a full-width divider. It sits above the page content (`LAYER_RAISED`),
 * so its tooltips aren't painted over by the content they drop into. The actions hold their size, so a long
 * description wraps instead of squeezing them.
 */
export function PageHeader({ title, description, status, actions, info, icon, onBack }: PageHeaderProps) {
  const hasLine = description !== undefined || status !== undefined
  return (
    <header className={cx('page-header relative flex items-center gap-12', LAYER_RAISED)}>
      {onBack ? (
        // Like every icon-only button: a tooltip names it, and it presses in.
        <Tooltip content="Back">
          <button type="button" className={BACK} onClick={onBack} aria-label="Back">
            <ArrowLeftIcon size={18} />
          </button>
        </Tooltip>
      ) : (
        <span className="page-header-icon" aria-hidden>
          {icon}
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <h1 className="type-heading-large text-primary">{title}</h1>
        {hasLine && (
          <div className={LINE}>
            {/* Keyed, so the description mounts afresh (and fades in) when the status clears. */}
            {status !== undefined ? (
              // Shown, not announced: the status region below says it.
              <span key="status" aria-hidden>
                {status}
              </span>
            ) : (
              <div key="description" className="animate-fade-in">
                {description}
              </div>
            )}
          </div>
        )}
        {/* Always mounted, so a status that appears is announced: a region that
            mounts already holding its text often isn't. */}
        <ScreenReaderStatus>{status}</ScreenReaderStatus>
      </div>
      {info && <IconButton label={info.label} icon={InfoIcon} tooltip={info.hint} className="shrink-0" />}
      {/* The divider parts info from the actions, so it needs both. */}
      {info && actions !== undefined && <span aria-hidden className={DIVIDER} />}
      {actions !== undefined && <div className="flex shrink-0 items-center gap-6">{actions}</div>}
    </header>
  )
}
