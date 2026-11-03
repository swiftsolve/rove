import { createContext } from 'react'

import type { Navigation } from '@/app/utils/location'

export const NavigationContext = createContext<Navigation | null>(null)
