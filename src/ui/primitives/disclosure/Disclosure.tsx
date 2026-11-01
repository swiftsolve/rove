import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react'
import { Collapsible } from '@base-ui/react/collapsible'
import { cva } from 'class-variance-authority'
import { cn } from '../../foundations/cn'

type DisclosureProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  /** `li` for a group in a list. */
  as?: 'div' | 'li'
  /** A DisclosureTrigger and a DisclosurePanel, wherever the layout puts them. */
  children: ReactNode
}

/** Shows and hides a panel from a trigger: a card's details, a group's rows. */
export function Disclosure({ isOpen, onOpenChange, as = 'div', children, ...props }: DisclosureProps): JSX.Element {
  return (
    <Collapsible.Root
      open={isOpen}
      onOpenChange={(isNowOpen) => onOpenChange(isNowOpen)}
      render={as === 'li' ? <li /> : <div />}
      {...props}
    >
      {children}
    </Collapsible.Root>
  )
}

/**
 * The button that opens and closes the panel; it says which (aria-expanded)
 * and what it controls. `data-panel-open` is set while open, for styling.
 */
export const DisclosureTrigger = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  function DisclosureTrigger(props, ref) {
    return <Collapsible.Trigger ref={ref} {...props} />
  },
)

const panelVariants = cva(undefined, {
  variants: {
    /** Grows and shrinks to its height, rather than appearing at once. */
    isAnimated: {
      true: [
        'h-(--collapsible-panel-height) overflow-hidden',
        'transition-[height] duration-(--duration-normal) ease-out',
        'data-starting-style:h-0 data-ending-style:h-0',
      ],
    },
  },
})

interface DisclosurePanelProps {
  isAnimated?: boolean
  className?: string
  children: ReactNode
}

/** What the trigger shows and hides; out of the page, and the accessibility tree, while closed. */
export function DisclosurePanel({ isAnimated = false, className, children }: DisclosurePanelProps): JSX.Element {
  return <Collapsible.Panel className={cn(panelVariants({ isAnimated }), className)}>{children}</Collapsible.Panel>
}
