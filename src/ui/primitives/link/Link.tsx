import { forwardRef, type AnchorHTMLAttributes } from 'react'
import { cn } from '../../foundations/cn'

// Focus shows the way hover does (an underline), not with a ring.
const LINK = 'text-accent no-underline hover:underline focus-visible:underline focus-visible:outline-none'

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string
  /** Opens in a new window, and says so to a screen reader. */
  isExternal?: boolean
}

/**
 * A link in running text, in the accent. For an action that moves around the
 * app, use `<Button variant="link">`; this is an `<a>` to a real address.
 */
export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { isExternal = false, className, children, ...anchorProps },
  ref,
) {
  return (
    <a
      ref={ref}
      className={cn(LINK, className)}
      {...(isExternal && { target: '_blank', rel: 'noreferrer' })}
      {...anchorProps}
    >
      {children}
      {isExternal && <span className="sr-only"> (opens in a new window)</span>}
    </a>
  )
})
