import { MoonIcon, NavItem, NavRail, SunIcon } from '@swiftsolve/rove-ui'

import { useNavigation } from '@/app/hooks/useNavigation'
import { useTheme } from '@/app/hooks/useTheme'
import { TABS } from '@/app/utils/tab-registry'
import { APP_TABS, type AppTab } from '@/app/utils/tabs'

const MAIN_TABS = APP_TABS.filter((id) => TABS[id].rail === 'main')
const FOOTER_TABS = APP_TABS.filter((id) => TABS[id].rail === 'footer')

/** A tab's rail item, lit while its screen (or one of its subpages) is showing. */
function TabItem({ id }: { id: AppTab }) {
  const { location, navigate } = useNavigation()
  const tab = TABS[id]
  const isActive = (TABS[location.tab].railTab ?? location.tab) === id
  return <NavItem label={tab.label} icon={tab.Icon} isActive={isActive} onClick={() => navigate({ tab: id })} />
}

function ThemeToggle() {
  const { isLight, toggle } = useTheme()
  // Show the icon for the mode you'll switch *to*, matching the tooltip.
  return (
    <NavItem
      label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      icon={isLight ? MoonIcon : SunIcon}
      onClick={toggle}
    />
  )
}

/** The nav rail: one item per tab, with the theme toggle and Settings in its footer. */
export function TabBar() {
  return (
    <NavRail
      label="Main navigation"
      main={MAIN_TABS.map((id) => (
        <TabItem key={id} id={id} />
      ))}
      // The theme toggle sits above the gear; About lives inside the Settings page.
      footer={[<ThemeToggle key="theme" />, ...FOOTER_TABS.map((id) => <TabItem key={id} id={id} />)]}
    />
  )
}
