import { cva } from 'class-variance-authority'
import { type ComponentProps, type ReactNode, useId } from 'react'

import { StretchedLink } from '../link/StretchedLink'
import { cn } from '../utils/cn'
import { CardProvider } from './context/CardProvider'

type CardProps = Omit<ComponentProps<'section'>, 'className' | 'children'> & {
  /**
   * `section` is named by its CardHeader's title, so give it one.
   * `div` or `li` for a card with no header, such as a card in a list.
   */
  as?: 'section' | 'div' | 'li'
  /** Opens the view the card summarises: the whole card is its link, and its header ends in a caret. */
  onOpen?: () => void
  /**
   * What a screen reader says for the card's link, which has no visible text,
   * when its CardHeader's title isn't enough: what the card shows, then where
   * it goes ("Usage: 3.2 GB today. Open Usage."). A card with no CardHeader needs it.
   */
  linkLabel?: string
  /** Its place in a layout: a width (`max-w-[320px]`) or a grid span (`col-span-2`). */
  className?: string
  /** A CardHeader, a CardBody and an optional CardFooter, or your own content. */
  children?: ReactNode
}

// An openable card lifts on hover and presses in, and its body fills its
// height. Hover sets box-shadow directly rather than through `shadow-raised`:
// that composes a five-layer shadow list, which would cross-fade from the
// card's shadow instead of morphing into it.
const cardVariants = cva('overflow-hidden surface contain-content', {
  variants: {
    isOpenable: {
      true: [
        'group/card relative flex cursor-pointer flex-col',
        'transition-[box-shadow,transform] duration-(--duration-fast) ease-in-out',
        'hover:[box-shadow:var(--shadow-raised)] active:transform-[translateY(1px)]',
      ],
    },
  },
})

/**
 * The panel surface, clipped to its rounded corners. Build it from a
 * CardHeader, a CardBody and an optional CardFooter, or lay out your own
 * content in an element of your own inside it. With `onOpen` the whole card
 * is a link; a control inside it raises itself above the link (`relative z-2`).
 */
export function Card({ as: Element = 'section', onOpen, linkLabel, className, children, ref, ...props }: CardProps) {
  const titleId = useId()
  const isOpenable = onOpen != null
  return (
    <CardProvider value={{ titleId, isOpenable }}>
      <Element
        // The ref is typed for a `section`; the cast lets it fit a `div` or `li`.
        ref={ref as never}
        className={cn(cardVariants({ isOpenable }), className)}
        aria-labelledby={Element === 'section' ? titleId : undefined}
        data-openable={isOpenable ? '' : undefined}
        {...props}
      >
        {/* First, so it comes before the card's own controls in tab order. */}
        {isOpenable && (
          <StretchedLink label={linkLabel} aria-labelledby={linkLabel == null ? titleId : undefined} onClick={onOpen} />
        )}
        {children}
      </Element>
    </CardProvider>
  )
}

/**
 * Moves focus to the link of the openable card holding `element`: for a
 * control in it that's about to unmount, so focus stays in the card instead
 * of falling back to the page.
 */
export function focusCardLink(element: HTMLElement): void {
  element.closest('[data-openable]')?.querySelector<HTMLElement>(':scope > [data-stretched-link]')?.focus()
}
