import { memo } from 'react'
import type { AppTab } from '@/navigation/tabs'
import { TAB_DEFINITIONS } from '@/navigation/tabs'
import { Tooltip } from '@/components/ui/Tooltip'
import './TabBar.css'

interface TabBarProps {
  readonly activeTab: AppTab
  readonly onChange: (tab: AppTab) => void
}

function TabBar({ activeTab, onChange }: TabBarProps): JSX.Element {
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
}

export default memo(TabBar)
