import { type JSX, type ReactNode, useState } from 'react'

import { DialogStateContext } from './dialog-state-context'

type DialogRootProps = {
  /** Opens the Dialog; false plays its leave animation, then unmounts it. */
  isOpen: boolean
  /** The component that renders the Dialog: mounted while open and while it leaves. */
  children: ReactNode
}

/**
 * Opens and closes a Dialog. Its children mount when `isOpen` turns true and
 * stay mounted until the Dialog's leave animation ends after it turns false,
 * so the component that renders the Dialog (and its state) lives only that long.
 */
export function DialogRoot({ isOpen, children }: DialogRootProps): JSX.Element | null {
  const [isMounted, setIsMounted] = useState(isOpen)
  if (isOpen && !isMounted) setIsMounted(true)
  if (!isMounted) return null
  return (
    <DialogStateContext value={{ isOpen, onExitComplete: () => setIsMounted(false) }}>{children}</DialogStateContext>
  )
}
