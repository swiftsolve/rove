import { createContext } from 'react'
import type { ConnectionStatus } from '@/app/utils/connection-status'

export const ConnectionStatusContext = createContext<ConnectionStatus | null>(null)
