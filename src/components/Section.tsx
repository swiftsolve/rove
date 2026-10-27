import { useId, type ReactNode } from 'react'
import { cx } from 'class-variance-authority'
import { DataList } from '@/components/DataRow'
import './Section.css'

interface SectionProps {
  title: string
  icon?: ReactNode
  action?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
  bodyClassName?: string
  /**
   * What the body holds: plain content (`div`, the default), a list of rows
   * (`ul`, each child an `<li>`), or label/value pairs (`dl`, each child a
   * `DataRow`). Only the element changes; the look stays the same.
   */
  bodyAs?: 'div' | 'ul' | 'dl'
}

function SectionBody({
  as,
  className,
  children,
}: {
  as: NonNullable<SectionProps['bodyAs']>
  className: string
  children: ReactNode
}): JSX.Element {
  if (as === 'ul') {
    return (
      <ul role="list" className={className}>
        {children}
      </ul>
    )
  }
  if (as === 'dl') return <DataList className={className}>{children}</DataList>
  return <div className={className}>{children}</div>
}

export function Section({
  title,
  icon,
  action,
  children,
  footer,
  className,
  bodyClassName,
  bodyAs = 'div',
}: SectionProps): JSX.Element {
  const titleId = useId()
  return (
    <section className={cx('ui-section', className)} aria-labelledby={titleId}>
      <div className="ui-section-header">
        <div className="ui-section-heading">
          {icon != null && (
            <span className="ui-section-icon" aria-hidden>
              {icon}
            </span>
          )}
          <h2 id={titleId} className="section-title">
            {title}
          </h2>
        </div>
        {action != null && <div className="ui-section-action">{action}</div>}
      </div>
      <SectionBody as={bodyAs} className={cx('ui-section-body', bodyClassName)}>
        {children}
      </SectionBody>
      {footer != null && <div className="ui-section-footer">{footer}</div>}
    </section>
  )
}
