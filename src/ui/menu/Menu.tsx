import { Menu as BaseMenu } from '@base-ui/react/menu'
import { cva, cx } from 'class-variance-authority'
import type { ComponentProps, ReactNode } from 'react'

import { type IconComponent, MoreVerticalIcon } from '../icons/Icons'
import { cn } from '../utils/cn'
import { LAYER_POPOVER } from '../utils/layers'
import type { VariantOf } from '../utils/variants'

type MenuProps = {
  /** Controlled open state; leave both out to let the menu keep its own. */
  isOpen?: boolean
  /** Called with the new state when the menu opens or closes. */
  onOpenChange?: (isOpen: boolean) => void
  /** A MenuTrigger and a MenuContent. */
  children: ReactNode
}

/**
 * An overflow menu: a kebab that opens a short list of actions. The arrow keys
 * move between items, Escape or a click outside closes it, and focus returns
 * to the kebab.
 */
export function Menu({ isOpen, onOpenChange, children }: MenuProps) {
  return (
    // Not modal: a click outside closes the menu and still lands where it was aimed.
    <BaseMenu.Root open={isOpen} onOpenChange={onOpenChange && ((isNowOpen) => onOpenChange(isNowOpen))} modal={false}>
      {children}
    </BaseMenu.Root>
  )
}

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

const CONTENT = cx(
  'flex min-w-[112px] flex-col gap-2 p-4',
  'rounded-sm border border-line bg-popover shadow-popover',
  'data-open:animate-menu-in',
  // Base UI parks focus on the popup when the menu opens without a keyboard;
  // the ring belongs on the items, which a keyboard open focuses instead.
  'outline-none',
)

/** The dropdown, under the kebab and lined up with its right edge. */
export function MenuContent({
  className,
  children,
  ...props
}: Omit<ComponentProps<'div'>, 'children'> & {
  /** MenuItems, in order. */
  children: ReactNode
}) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner className={LAYER_POPOVER} side="bottom" align="end" sideOffset={4}>
        <BaseMenu.Popup className={cn(CONTENT, className)} render={<div {...props} />}>
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  )
}

const itemVariants = cva(
  [
    'flex w-full items-center gap-8 rounded-xs p-8 text-left type-label-menu',
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
