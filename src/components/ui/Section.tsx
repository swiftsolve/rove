import type { ReactNode } from 'react'
import './Section.css'

interface SectionProps {
  readonly title: string
  readonly icon?: ReactNode
  readonly action?: ReactNode
  readonly children: ReactNode
  readonly footer?: ReactNode
  readonly className?: string
  readonly bodyClassName?: string
}

export default function Section({
  title,
  icon,
  action,
  children,
  footer,
  className = '',
  bodyClassName = '',
}: SectionProps): JSX.Element {
  const bodyClasses = ['ui-section-body', bodyClassName].filter(Boolean).join(' ')

  return (
    <section className={`ui-section ${className}`.trim()}>
      <header className="ui-section-header">
        <div className="ui-section-heading">
          {icon != null && <span className="ui-section-icon">{icon}</span>}
          <h2 className="section-title">{title}</h2>
        </div>
        {action != null && <div className="ui-section-action">{action}</div>}
      </header>
      <div className={bodyClasses}>{children}</div>
      {footer != null && <div className="ui-section-footer">{footer}</div>}
    </section>
  )
}
