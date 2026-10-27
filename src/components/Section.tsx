import type { ReactNode } from 'react'
import { cx } from '@/lib/cx'
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

export function Section({
  title,
  icon,
  action,
  children,
  footer,
  className,
  bodyClassName,
}: SectionProps): JSX.Element {
  return (
    <section className={cx('ui-section', className)}>
      <header className="ui-section-header">
        <div className="ui-section-heading">
          {icon != null && <span className="ui-section-icon">{icon}</span>}
          <h2 className="section-title">{title}</h2>
        </div>
        {action != null && <div className="ui-section-action">{action}</div>}
      </header>
      <div className={cx('ui-section-body', bodyClassName)}>{children}</div>
      {footer != null && <div className="ui-section-footer">{footer}</div>}
    </section>
  )
}
