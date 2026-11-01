import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Menu as BaseMenu } from '@base-ui/react/menu'
import { cva, cx } from 'class-variance-authority'
import type { VariantOf } from '../foundations/variants'
import { cn } from '../foundations/cn'
import { MoreVerticalIcon, type IconComponent } from '../icons/Icons'

interface MenuProps {
  /** Controlled open state; leave both out to let the menu keep its own. */
  isOpen?: boolean
  onOpenChange?: (isOpen: boolean) => void
  /** A MenuTrigger and a MenuContent. */
  children: ReactNode
}

/**
 * An overflow menu: a kebab that opens a short list of actions. The arrow keys
 * move between items, Escape or a click outside closes it, and focus returns
 * to the kebab.
 */
export function Menu({ isOpen, onOpenChange, children }: MenuProps): JSX.Element {
  return (
    // Not modal: a click outside closes the menu and still lands where it was aimed.
    <BaseMenu.Root
      open={isOpen}
      onOpenChange={onOpenChange && ((isNowOpen) => onOpenChange(isNowOpen))}
      modal={false}
    >
      {children}
    </BaseMenu.Root>
  )
}

// Tertiary until hovered or open.
const TRIGGER = cx(
  'inline-flex size-[30px] shrink-0 items-center justify-center rounded-sm text-tertiary',
  'transition-[color,background] duration-(--duration-fast) ease-in-out',
  'hover:bg-hover hover:text-primary data-popup-open:bg-hover data-popup-open:text-primary',
)

type MenuTriggerProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> & {
  /** Names the kebab, which has no visible text: "Options for Google". */
  label: string
}

/** The kebab that opens the menu. `className` is for where it sits (a row that reveals it on hover). */
export const MenuTrigger = forwardRef<HTMLButtonElement, MenuTriggerProps>(function MenuTrigger(
  { label, className, ...buttonProps },
  ref,
) {
  return (
    <BaseMenu.Trigger ref={ref} className={cn(TRIGGER, className)} aria-label={label} {...buttonProps}>
      <MoreVerticalIcon size={16} />
    </BaseMenu.Trigger>
  )
})

const CONTENT = cx(
  'flex min-w-[112px] flex-col gap-2 p-4',
  'rounded-sm border border-line-strong bg-surface shadow-raised',
  'data-open:animate-menu-in',
)

/** The dropdown, under the kebab and lined up with its right edge. */
export function MenuContent({ children }: { children: ReactNode }): JSX.Element {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner className="z-20" side="bottom" align="end" sideOffset={4}>
        <BaseMenu.Popup className={CONTENT}>{children}</BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  )
}

const itemVariants = cva(
  [
    'flex w-full items-center gap-8 rounded-xs p-8 text-left text-sm font-medium',
    'transition-[color,background] duration-(--duration-fast) ease-in-out',
    // Items fill the menu edge to edge, so the ring goes inside the item.
    'focus-visible:outline-offset-(--focus-inset)',
  ],
  {
    variants: {
      tone: {
        neutral: 'text-secondary hover:bg-hover hover:text-primary',
        /** Destructive (Remove, Clear history): red text on a red-tinted hover. */
        negative: 'text-negative hover:bg-status-negative/(--opacity-tint-md)',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

interface MenuItemProps {
  icon?: IconComponent
  tone?: VariantOf<typeof itemVariants, 'tone'>
  /** Runs the action; the menu closes. */
  onClick: () => void
  children: ReactNode
}

/** One action in a MenuContent. */
export function MenuItem({ icon: Icon, tone, onClick, children }: MenuItemProps): JSX.Element {
  return (
    <BaseMenu.Item
      className={itemVariants({ tone })}
      onClick={onClick}
      nativeButton
      render={<button type="button" />}
    >
      {Icon && <Icon size={14} />}
      {children}
    </BaseMenu.Item>
  )
}
