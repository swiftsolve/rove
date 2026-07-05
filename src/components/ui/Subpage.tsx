import type { ReactNode } from 'react'
import { ArrowLeftIcon } from '@/components/ui/Icons'
import './Subpage.css'

interface SubpageProps {
  readonly title: string
  readonly description?: string
  /** Optional control rendered opposite the back button. */
  readonly action?: ReactNode
  readonly onBack: () => void
  readonly children: ReactNode
}

export default function Subpage({
  title,
  description,
  action,
  onBack,
  children,
}: SubpageProps): JSX.Element {
  return (
    <div className="subpage">
      <header className="subpage-head">
        <div className="subpage-intro">
          <button
            type="button"
            className="subpage-back"
            onClick={onBack}
            aria-label="Back"
          >
            <ArrowLeftIcon size={16} />
          </button>
          <h1 className="subpage-title">{title}</h1>
          {description != null && <p className="subpage-desc text-hint">{description}</p>}
        </div>
        {action != null && <div className="subpage-action">{action}</div>}
      </header>

      {children}
    </div>
  )
}
