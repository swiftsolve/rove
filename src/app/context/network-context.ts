import { createContext } from 'react'

import type { NetworkState } from '@/app/hooks/useNetworkInfoSource'

export const NetworkContext = createContext<NetworkState | null>(null)
