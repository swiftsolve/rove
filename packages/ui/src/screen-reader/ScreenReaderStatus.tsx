import type { ComponentProps } from 'react'

import { cn } from '../utils/cn'

/**
 * A status only a screen reader hears: hidden on screen, and read out each
 * time its text changes ("Testing download…"). Keep it mounted and pass empty
 * text when there's nothing to say: a region that mounts already holding its
 * text often isn't announced.
 */
export function ScreenReaderStatus({ className, ...spanProps }: Omit<ComponentProps<'span'>, 'role'>) {
  return <span role="status" className={cn('sr-only', className)} {...spanProps} />
}
