import { createContext } from 'react'

import type { NetworkState } from '@/features/connection/hooks/useNetworkInfoSource'

export const NetworkContext = createContext<NetworkState | null>(null)
