import { locationKey } from '@/app/utils/location'
import { useNavigation } from '@/app/hooks/useNavigation'
import { useAppData } from '@/app/hooks/useAppData'
import { useScreenFocus } from '@/app/hooks/useScreenFocus'
import { TabBar } from '@/app/components/TabBar'
import { UpdatePrompt } from '@/app/components/UpdatePrompt'
import { StatusBar } from '@/app/components/StatusBar'
import { NetworkErrorBanner, NetworkLoadingScreen } from '@/app/components/NetworkInfoStates'
import { CurrentScreen, needsNetworkInfo } from '@/app/components/CurrentScreen'
import styles from './AppShell.module.css'

/**
 * The window's layout: title bar, nav rail and the scrolling content column.
 * The screen inside it is picked by `CurrentScreen` from the current location.
 */
export function AppShell(): JSX.Element {
  const { location } = useNavigation()
  const { network } = useAppData()
  const { scrollRef, mainRef } = useScreenFocus(locationKey(location))

  // Show the loading/error state only in the content area (not full-screen) so
  // the window chrome and tabs stay usable even before info arrives.
  const isWaitingForNetworkInfo = !network.info && needsNetworkInfo(location)

  return (
    <div className={styles.shell} data-app-shell>
      <UpdatePrompt />
      <StatusBar />

      <div className={styles.lower}>
        <TabBar />

        {/* Dialogs portal in here so they cover the content column, not the window. */}
        <div className={styles.column} data-modal-root>
          <div className={styles.frame}>
            <section ref={scrollRef} className={styles.scroll} data-scroll-root aria-label="Main content">
              {network.error && network.info && <NetworkErrorBanner />}

              <main ref={mainRef} className={styles.main}>
                {isWaitingForNetworkInfo ? <NetworkLoadingScreen /> : <CurrentScreen />}
              </main>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
