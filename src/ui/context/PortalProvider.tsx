import type { ReactNode } from 'react'

import { PortalContext } from './portal-context'

type PortalProviderProps = {
  /**
   * Where dialogs render, and what they cover and centre in: a positioned
   * element (the app's content column, so the nav rail stays uncovered).
   * Null until it mounts; a dialog renders in place until then.
   */
  container: HTMLElement | null
  children: ReactNode
}

/** Sets where the library's dialogs inside it portal to. */
export function PortalProvider({ container, children }: PortalProviderProps) {
  return <PortalContext value={container}>{children}</PortalContext>
}
