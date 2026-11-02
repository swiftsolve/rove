import type { ReactNode } from 'react'
import { LockIcon } from '../icons/Icons'

interface EmptyStateProps {
  /**
   * A lock badge over the placeholder rows, for a list that can't fill until
   * the user acts (admin access needed) rather than one waiting for data.
   */
  isLocked?: boolean
  /** What's empty: "No devices yet". */
  title: string
  /** A line or two naming what will fill the page, or why it can't. */
  description?: ReactNode
  /** Controls below the description, usually a retry button. */
  actions?: ReactNode
}

// Widths of each placeholder row's title and meta bars, so the two rows don't
// read as one shape stamped twice.
const PLACEHOLDER_ROWS = [
  ['w-[58%]', 'w-[32%]'],
  ['w-[66%]', 'w-[26%]'],
] as const

/**
 * The shared "nothing here yet" page: faded placeholder rows (with a lock badge
 * when the list is locked), a title, a short explanation and an optional action, centred
 * in the content region. Every view's blank state goes through this so they
 * line up on one rhythm and one measure.
 */
export function EmptyState({ isLocked = false, title, description, actions }: EmptyStateProps): JSX.Element {
  return (
    // `.page-empty` lays out the page; the bottom pad lifts the group a little
    // above centre, under the header, and the action is nudged down from the
    // copy above it.
    <div className="page-empty gap-8 pb-[56px] text-center">
      <PlaceholderRows isLocked={isLocked} />
      {/* An h2 for the page outline. */}
      <h2 className="text-md font-semibold text-primary">{title}</h2>
      {description != null && <EmptyStateDescription>{description}</EmptyStateDescription>}
      {actions != null && <div className="mt-8">{actions}</div>}
    </div>
  )
}

/** The shape of the list to come: one row, and a second fading out below it. */
function PlaceholderRows({ isLocked }: { isLocked: boolean }): JSX.Element {
  return (
    <div aria-hidden className="relative mb-12 w-[min(300px,80%)]">
      <div className="flex flex-col gap-8 [mask-image:linear-gradient(to_bottom,#000_45%,transparent_105%)]">
        {PLACEHOLDER_ROWS.map(([titleWidth, metaWidth]) => (
          <div key={titleWidth} className="flex items-center gap-10 rounded-lg bg-surface px-12 py-10">
            <div className="size-[22px] shrink-0 rounded-sm bg-fill-default" />
            <div className="flex flex-1 flex-col gap-6">
              <div className={`h-6 rounded-full bg-fill-default ${titleWidth}`} />
              <div className={`h-4 rounded-full bg-fill-default ${metaWidth}`} />
            </div>
            <div className="h-6 w-[36px] rounded-full bg-fill-default" />
          </div>
        ))}
      </div>
      {/* Outside the fade, so the badge stays crisp over the rows. */}
      {isLocked && (
        <div className="absolute top-1/2 left-1/2 flex size-[36px] -translate-1/2 items-center justify-center rounded-full bg-surface text-tertiary shadow-raised">
          <LockIcon size={20} />
        </div>
      )}
    </div>
  )
}

/** A line of explanation under the title — also for extra notes the `actions` add. */
export function EmptyStateDescription({
  children,
  role,
}: {
  /** The note. */
  children: ReactNode
  /** `status` for a note that appears in answer to an action, so it's announced. */
  role?: 'status'
}): JSX.Element {
  return (
    <p className="max-w-[34ch] text-sm leading-body-small text-tertiary" role={role}>
      {children}
    </p>
  )
}
