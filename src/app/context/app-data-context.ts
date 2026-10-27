import { createContext } from 'react'
import type { InternetStatus } from '@/types'
import type { useNetworkInfo } from '@/features/connection/hooks/useNetworkInfo'
import type { ConnectionStatus } from '@/app/utils/connection-status'
import type { ScreenData } from '@/app/hooks/useScreenData'

export interface AppData {
  /** The local link (Wi-Fi / Ethernet): `info` is null until the first read lands. */
  network: ReturnType<typeof useNetworkInfo>
  /** Whether the public internet is reachable, from the backend heartbeat. Null
   *  until the first verdict. */
  internet: InternetStatus | null
  /** The two above combined into the title bar's verdict. */
  connection: ConnectionStatus
  /** Each screen's backend data, cached across tab switches. */
  screens: ScreenData
}

export const AppDataContext = createContext<AppData | null>(null)
