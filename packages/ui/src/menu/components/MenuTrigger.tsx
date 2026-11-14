import { Menu as BaseMenu } from '@base-ui/react/menu'
import { cx } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { MoreVerticalIcon } from '../../icons/Icons'
import { cn } from '../../utils/cn'

const TRIGGER = cx(
  'inline-flex size-[30px] shrink-0 items-center justify-center rounded-sm text-tertiary',
  'transition-[color,background] duration-(--duration-fast) ease-in-out',
  'hover:bg-hover hover:text-primary data-popup-open:bg-hover data-popup-open:text-primary',
)

type MenuTriggerProps = Omit<ComponentProps<'button'>, 'aria-label' | 'children'> & {
  /** Names the kebab, which has no visible text: "Options for Google". */
  label: string
}

/** The kebab that opens the menu. `className` is for where it sits (a row that reveals it on hover). */
export function MenuTrigger({ label, className, ...buttonProps }: MenuTriggerProps) {
  return (
    <BaseMenu.Trigger className={cn(TRIGGER, className)} aria-label={label} {...buttonProps}>
      <MoreVerticalIcon size={16} />
    </BaseMenu.Trigger>
  )
}
