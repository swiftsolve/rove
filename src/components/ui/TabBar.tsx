import { memo, type JSX } from 'react'
import type { AppTab } from '@/navigation/tabs'
import {
  ConnectionIcon,
  DevicesIcon,
  HomeIcon,
  LayersIcon,
  SpeedIcon,
  UsageIcon,
} from '@/components/ui/Icons'
import { Tooltip } from '@/components/ui/Tooltip'
import './TabBar.css'

interface TabBarProps {
  readonly activeTab: AppTab
  readonly onChange: (tab: AppTab) => void
}

interface TabIconProps {
  readonly size?: number
  readonly className?: string
}

interface TabDefinition {
  readonly id: AppTab
  readonly label: string
  readonly Icon: (props: TabIconProps) => JSX.Element
}

const TAB_DEFINITIONS: readonly TabDefinition[] = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'speed', label: 'Speed', Icon: SpeedIcon },
  { id: 'devices', label: 'Devices', Icon: DevicesIcon },
  { id: 'interfaces', label: 'Interfaces', Icon: LayersIcon },
  { id: 'diagnostics', label: 'Connection', Icon: ConnectionIcon },
  { id: 'usage', label: 'Usage', Icon: UsageIcon },
]

export default memo(function TabBar({ activeTab, onChange }: TabBarProps) {
  return (
    <nav className="nav-rail" aria-label="Main navigation">
      <div className="nav-items">
        {TAB_DEFINITIONS.map((tab) => {
          const active = tab.id === activeTab

          return (
            <Tooltip key={tab.id} content={tab.label} placement="right">
              <button
                type="button"
                className={`nav-item ${active ? 'active' : ''}`}
                onClick={() => onChange(tab.id)}
                aria-current={active ? 'page' : undefined}
                aria-label={tab.label}
              >
                <tab.Icon size={18} className="nav-icon" />
              </button>
            </Tooltip>
          )
        })}
      </div>
    </nav>
  )
})
