import type { ReactNode } from 'react'
import './Section.css'

interface SectionProps {
  title: string
  icon?: ReactNode
  action?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
  bodyClassName?: string
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
