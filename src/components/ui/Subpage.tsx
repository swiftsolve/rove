import type { ReactNode } from 'react'
import { ArrowLeftIcon } from '@/components/ui/Icons'
import './Subpage.css'

interface SubpageProps {
  readonly title: string
  readonly description?: ReactNode
  /** Optional control rendered opposite the back button. */
  readonly action?: ReactNode
  /** Extra class on the page root, for per-page tweaks to the shared layout. */
  readonly className?: string
  readonly onBack: () => void
  readonly children: ReactNode
}

export default function Subpage({
  title,
  description,
  action,
  className,
  onBack,
  children,
}: SubpageProps): JSX.Element {
  return (
    <div className={className != null ? `subpage ${className}` : 'subpage'}>
      <header className="view-header subpage-head">
        <button
          type="button"
          className="subpage-back"
          onClick={onBack}
          aria-label="Back"
        >
          <ArrowLeftIcon size={18} />
        </button>
        <div className="subpage-text">
          <h1 className="view-header-title">{title}</h1>
          {description != null && <p className="subpage-desc">{description}</p>}
        </div>
        {action != null && <div className="subpage-action">{action}</div>}
      </header>

      {children}
    </div>
  )
}
