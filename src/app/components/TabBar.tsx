import { APP_TABS, type AppTab } from '@/app/utils/tabs'
import { TABS } from '@/app/utils/tab-registry'
import { MoonIcon, NavItem, NavRail, SunIcon } from '@/ui'
import { useNavigation } from '@/app/hooks/useNavigation'
import { useTheme } from '@/app/hooks/useTheme'

const MAIN_TABS = APP_TABS.filter((id) => TABS[id].rail === 'main')
const FOOT_TABS = APP_TABS.filter((id) => TABS[id].rail === 'foot')

/** A tab's rail item, lit while its screen (or one of its subpages) is showing. */
function TabItem({ id }: { id: AppTab }): JSX.Element {
  const { location, navigate } = useNavigation()
  const tab = TABS[id]
  const isActive = (TABS[location.tab].railTab ?? location.tab) === id
  return <NavItem label={tab.label} icon={tab.Icon} isActive={isActive} onClick={() => navigate({ tab: id })} />
}

function ThemeToggle(): JSX.Element {
  const { isLight, toggle } = useTheme()
  // Show the glyph for the mode you'll switch *to*, matching the tooltip.
  return (
    <NavItem
      label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      icon={isLight ? MoonIcon : SunIcon}
      onClick={toggle}
    />
  )
}

/** The nav rail: one item per tab, with the theme toggle and Settings at the foot. */
export function TabBar(): JSX.Element {
  return (
    <NavRail
      label="Main navigation"
      main={MAIN_TABS.map((id) => (
        <TabItem key={id} id={id} />
      ))}
      // The theme toggle sits above the gear; About lives inside the Settings page.
      foot={[<ThemeToggle key="theme" />, ...FOOT_TABS.map((id) => <TabItem key={id} id={id} />)]}
    />
  )
}
