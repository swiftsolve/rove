import { createContext } from 'react'

import type { InternetStatus } from '@/types'

/** Undefined means "no provider". Null is a real value: no verdict yet. */
export const InternetStatusContext = createContext<InternetStatus | null | undefined>(undefined)
