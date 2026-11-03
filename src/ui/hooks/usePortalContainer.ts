import { use } from 'react'
import { PortalContext } from '../context/portal-context'

/** The element a PortalProvider above names for overlays, or null for in place. */
export function usePortalContainer(): HTMLElement | null {
  return use(PortalContext)
}
