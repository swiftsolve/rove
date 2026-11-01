import { createContext } from 'react'

/** The element the library's overlays portal into; null renders them in place. */
export const PortalContext = createContext<HTMLElement | null>(null)
