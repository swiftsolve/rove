import { cx } from 'class-variance-authority'
import { useState } from 'react'

import { AppErrorBoundary } from '@/app/components/AppErrorBoundary'
import { AppTitleBar } from '@/app/components/AppTitleBar'
import { CurrentScreen } from '@/app/components/CurrentScreen'
import { NetworkErrorBanner } from '@/app/components/NetworkInfoStates'
import { TabBar } from '@/app/components/TabBar'
import { UpdatePrompt } from '@/app/components/UpdatePrompt'
import { useNavigation } from '@/app/hooks/useNavigation'
import { useScreenFocus } from '@/app/hooks/useScreenFocus'
import { locationKey } from '@/app/utils/location'
import { PortalProvider } from '@/ui'

// Column flex so <main> fills the visible area and centres the loading screen.
// overflow-y: scroll, not scrollbar-gutter, which WebKitGTK ignores until the
// content overflows. The right inset is 7px of padding plus the 5px scrollbar
// (base.css), matching the rail's 12px.
const SCROLL = cx(
  'flex min-h-0 min-w-0 flex-1 flex-col',
  'overflow-x-hidden overflow-y-scroll overscroll-contain [-webkit-overflow-scrolling:touch]',
  'py-12 pr-(--content-inset-right) pl-12',
  '[&>.banner]:mb-12',
)

/**
 * The window's layout: title bar, nav rail and the scrolling content column.
 * The screen inside it is picked by `CurrentScreen` from the current location.
 */
export function AppShell() {
  const { location, returnPoint } = useNavigation()
  const { scrollRef, mainRef } = useScreenFocus(locationKey(location), returnPoint)
  // State, not a ref: the provider has to re-render with the column once it mounts.
  const [contentColumn, setContentColumn] = useState<HTMLDivElement | null>(null)

  // No network info is read here: the banner and `CurrentScreen` read it
  // themselves, so a new reading doesn't re-render the title bar and nav rail.
  return (
    // Dialogs anywhere in the shell, the update prompt's included, portal into
    // the content column, so they cover it and not the window.
    <PortalProvider container={contentColumn}>
      {/* Square corners: the window is opaque (Tauri transparent:false, needed by
          WebKitGTK on NVIDIA, see run() in lib.rs), so a radius would expose the
          window's background, not the desktop. */}
      <div className="flex h-full flex-col overflow-hidden border border-line bg-base" data-app-shell>
        <UpdatePrompt />
        <AppTitleBar />

        <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
          <TabBar />

          {/* The dialogs' portal container and positioning context. */}
          <div ref={setContentColumn} className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex min-h-0 w-full flex-1 animate-fade-in flex-col overflow-hidden">
              {/* A plain div, not a landmark: <main> inside it must be top-level. */}
              <div ref={scrollRef} className={SCROLL} data-scroll-root>
                <NetworkErrorBanner />

                <main ref={mainRef} className="flex flex-1 flex-col gap-10">
                  <AppErrorBoundary key={locationKey(location)}>
                    <CurrentScreen />
                  </AppErrorBoundary>
                </main>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PortalProvider>
  )
}
