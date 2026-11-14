import { Menu as BaseMenu } from '@base-ui/react/menu'
import { cva } from 'class-variance-authority'
import type { ComponentProps, ReactNode } from 'react'

import type { IconComponent } from '../../icons/Icons'
import { cn } from '../../utils/cn'
import type { VariantOf } from '../../utils/variants'

const itemVariants = cva(
  [
    'type-body-medium flex w-full items-center gap-8 rounded-xs p-8 text-left',
    'transition-[color,background] duration-(--duration-fast) ease-in-out',
    // The pointer and the arrow keys highlight an item the same way, as in a
    // native menu (Base UI's data-highlighted). The highlight is the focus
    // indicator, so no ring.
    'outline-none',
  ],
  {
    variants: {
      tone: {
        neutral: 'text-secondary data-highlighted:bg-overlay-default data-highlighted:text-primary',
        negative: 'text-negative data-highlighted:bg-status-negative/(--opacity-tint-md)',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

type MenuItemProps = Omit<ComponentProps<'button'>, 'children' | 'onClick' | 'type'> & {
  /** An icon before the label. */
  icon?: IconComponent
  /** `negative` for a destructive action (Remove, Clear history): red text on a red-tinted highlight. */
  tone?: VariantOf<typeof itemVariants, 'tone'>
  /** Runs the action; the menu closes. */
  onClick: () => void
  /** The label. */
  children: ReactNode
}

/** One action in a MenuContent. */
export function MenuItem({ icon: Icon, tone = 'neutral', onClick, className, children, ...props }: MenuItemProps) {
  return (
    <BaseMenu.Item
      className={cn(itemVariants({ tone }), className)}
      onClick={onClick}
      nativeButton
      render={<button type="button" {...props} />}
    >
      {Icon && <Icon size={14} />}
      {children}
    </BaseMenu.Item>
  )
}
