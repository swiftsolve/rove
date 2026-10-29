import type { ReactNode } from 'react'

interface IconProps {
  size?: number
  className?: string
}

interface EmptyStateProps {
  /**
   * Glyph above the title, for a notice rather than a list waiting to fill
   * (admin access needed) — any alias from `Icons`, drawn at the shared size.
   * Without one, faded placeholder rows stand in for the list.
   */
  icon?: (props: IconProps) => JSX.Element
  title: string
  /** A line or two naming what will fill the page, or why it can't. */
  hint?: ReactNode
  /** Control below the hint, usually a retry button. */
  action?: ReactNode
}

// Widths of each placeholder row's title and meta bars, so the two rows don't
// read as one shape stamped twice.
const PLACEHOLDER_ROWS = [
  ['w-[58%]', 'w-[32%]'],
  ['w-[66%]', 'w-[26%]'],
] as const

/**
 * The shared "nothing here yet" page: faded placeholder rows (or a muted glyph
 * for a notice), a title, a short explanation and an optional action, centred
 * in the content region. Every view's blank state goes through this so they
 * line up on one rhythm and one measure.
 */
export function EmptyState({ icon: Icon, title, hint, action }: EmptyStateProps): JSX.Element {
  return (
    // `.page-empty` lays out the page; the bottom pad lifts the group a little
    // above centre, under the header, and the action is nudged down from the
    // copy above it.
    <div className="page-empty gap-8 pb-[56px] text-center [&>button]:mt-8">
      {Icon ? (
        <Icon size={32} className="mb-8 text-tertiary opacity-(--opacity-muted-glyph)" />
      ) : (
        <PlaceholderRows />
      )}
      {/* An h2 for the page outline. */}
      <h2 className="text-md font-semibold text-primary">{title}</h2>
      {hint != null && <EmptyStateHint>{hint}</EmptyStateHint>}
      {action}
    </div>
  )
}

/** The shape of the list to come: one row, and a second fading out below it. */
function PlaceholderRows(): JSX.Element {
  return (
    <div
      aria-hidden
      className="mb-12 flex w-[min(300px,80%)] flex-col gap-8 [mask-image:linear-gradient(to_bottom,#000_45%,transparent_105%)]"
    >
      {PLACEHOLDER_ROWS.map(([titleWidth, metaWidth]) => (
        <div key={titleWidth} className="flex items-center gap-10 rounded-lg bg-panel px-12 py-10">
          <div className="size-[22px] shrink-0 rounded-sm bg-fill-track" />
          <div className="flex flex-1 flex-col gap-6">
            <div className={`h-6 rounded-full bg-fill-track ${titleWidth}`} />
            <div className={`h-4 rounded-full bg-fill-track ${metaWidth}`} />
          </div>
          <div className="h-6 w-[36px] rounded-full bg-fill-track" />
        </div>
      ))}
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
    <p className="max-w-[34ch] text-sm leading-small text-tertiary" role={role}>
      {children}
    </p>
  )
}
