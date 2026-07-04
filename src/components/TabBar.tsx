import { memo } from 'react'
import type { AppTab } from '../navigation/tabs'
import { TAB_DEFINITIONS } from '../navigation/tabs'
import './TabBar.css'

interface TabBarProps {
  readonly activeTab: AppTab
  readonly onChange: (tab: AppTab) => void
}

function TabBar({ activeTab, onChange }: TabBarProps): JSX.Element {
  return (
    <nav className="seg-control" aria-label="Main navigation">
      {TAB_DEFINITIONS.map((tab) => {
        const active = tab.id === activeTab

        return (
          <button
            key={tab.id}
            type="button"
            className={`seg-item ${active ? 'active' : ''}`}
            onClick={() => onChange(tab.id)}
            aria-current={active ? 'page' : undefined}
          >
            <tab.Icon size={16} className="seg-icon" />
            <span className="seg-label">{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

export default memo(TabBar)
