import type { ReactNode } from 'react'
import { cx } from 'class-variance-authority'
import { cn } from '@/lib/cn'
import { ArrowLeftIcon } from '@/components/icons/Icons'

// A chip-styled back button in the page icon's slot (a rail item's box, 10px radius), so
// a subpage header reads like a top-level view's.
const BACK = cx(
  'subpage-back inline-flex size-(--rail-item-size) shrink-0 items-center justify-center rounded-md',
  'bg-fill-chip text-secondary hover:bg-hover hover:text-primary',
  'transition-[color,background] duration-(--duration-fast) ease-in-out',
)

interface SubpageProps {
  title: string
  description?: ReactNode
  /** Optional control rendered opposite the back button. */
  action?: ReactNode
  /** Extra class on the page root, for per-page tweaks to the shared layout. */
  className?: string
  onBack: () => void
  children: ReactNode
}

/**
 * A page layered over a tab: laid out and staggered in like a top-level view
 * (`page`), under a header that mirrors the view header.
 */
export function Subpage({
  title,
  description,
  action,
  className,
  onBack,
  children,
}: SubpageProps): JSX.Element {
  return (
    <div className={cn('subpage page', className)}>
      <header className="page-header subpage-head flex items-center gap-12">
        <button type="button" className={BACK} onClick={onBack} aria-label="Back">
          <ArrowLeftIcon size={18} />
        </button>
        <div className="subpage-text flex min-w-0 flex-1 flex-col gap-4">
          <h1 className="page-header-title">{title}</h1>
          {description != null && <p className="subpage-desc text-xs leading-meta text-tertiary">{description}</p>}
        </div>
        {action != null && <div className="subpage-action flex shrink-0 items-center">{action}</div>}
      </header>

      {children}
    </div>
  )
}
