import type { JSX } from 'react'
import { ActivityIcon, DeviceIcon, HomeIcon, LayersIcon, UsageIcon } from '@/components/ui/Icons'

export const APP_TABS = ['home', 'interfaces', 'devices', 'usage', 'diagnostics'] as const

export type AppTab = (typeof APP_TABS)[number]

interface TabIconProps {
  readonly size?: number
  readonly className?: string
}

export interface TabDefinition {
  readonly id: AppTab
  readonly label: string
  readonly Icon: (props: TabIconProps) => JSX.Element
}

export const TAB_DEFINITIONS: readonly TabDefinition[] = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'interfaces', label: 'Interfaces', Icon: LayersIcon },
  { id: 'devices', label: 'Devices', Icon: DeviceIcon },
  { id: 'usage', label: 'Usage', Icon: UsageIcon },
  { id: 'diagnostics', label: 'Connection', Icon: ActivityIcon },
]
