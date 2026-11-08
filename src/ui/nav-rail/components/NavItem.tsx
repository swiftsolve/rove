import { cva } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import type { IconComponent } from '../../icons/Icons'
import { Tooltip } from '../../tooltip/Tooltip'
import { cn } from '../../utils/cn'
import { ACTIVE_BAR } from '../utils/active-bar'

const itemVariants = cva(
  [
    'relative inline-flex size-(--rail-item-size) items-center justify-center rounded-md',
    'transition-[color,background] duration-(--duration-normal) ease-out',
  ],
  {
    variants: {
      isActive: {
        true: ['bg-accent-muted text-accent', ACTIVE_BAR],
        false: 'text-tertiary hover:bg-overlay-subtle hover:text-secondary',
      },
    },
    defaultVariants: { isActive: false },
  },
)

type NavItemProps = Omit<ComponentProps<'button'>, 'children' | 'onClick' | 'type' | 'aria-label'> & {
  /** Names the item, which shows only its icon; also its tooltip. */
  label: string
  /** The icon. */
  icon: IconComponent
  /** The current page's item: tinted, with the accent bar. */
  isActive?: boolean
  /** Goes to the page, or runs the action. */
  onClick: () => void
}

/** One rail button: a page, or an action such as the theme switch. */
export function NavItem({ label, icon: Icon, isActive = false, onClick, className, ...props }: NavItemProps) {
  return (
    <Tooltip content={label} side="right">
      <button
        {...props}
        type="button"
        className={cn(itemVariants({ isActive }), className)}
        onClick={onClick}
        aria-current={isActive ? 'page' : undefined}
        aria-label={label}
      >
        <Icon size={18} className="shrink-0" />
      </button>
    </Tooltip>
  )
}
