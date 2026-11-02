import { locationKey } from '@/app/utils/location'
import { useNavigation } from '@/app/hooks/useNavigation'
import { useScreenFocus } from '@/app/hooks/useScreenFocus'
import { TabBar } from '@/app/components/TabBar'
import { UpdatePrompt } from '@/app/components/UpdatePrompt'
import { AppTitleBar } from '@/app/components/AppTitleBar'
import { NetworkErrorBanner } from '@/app/components/NetworkInfoStates'
import { CurrentScreen } from '@/app/components/CurrentScreen'
import { useState } from 'react'
import { cx } from 'class-variance-authority'
import { PortalProvider } from '@/ui'

// The scrolling content area. Column flex so <main> can grow to fill the
// visible area, which centres the first-launch loading screen in the content
// region instead of overflowing a fixed 100vh. The scrollbar is always laid
// out (overflow-y: scroll; it has no thumb until there is something to scroll)
// rather than reserved with scrollbar-gutter, which WebKitGTK ignores until the
// content overflows. Both insets match the nav rail's 12px: the right one is
// 7px of padding plus the 5px scrollbar (base.css). The error banner above
// <main> has no flex gap to lean on.
const SCROLL = cx(
  'flex flex-1 flex-col min-w-0 min-h-0',
  'overflow-x-hidden overflow-y-scroll overscroll-contain [-webkit-overflow-scrolling:touch]',
  'pl-12 pr-(--content-inset-right) pt-12 pb-20',
  '[&>.banner]:mb-12',
)

/**
 * The window's layout: title bar, nav rail and the scrolling content column.
 * The screen inside it is picked by `CurrentScreen` from the current location.
 */
export function AppShell(): JSX.Element {
  const { location } = useNavigation()
  const { scrollRef, mainRef } = useScreenFocus(locationKey(location))
  // State, not a ref: the provider has to re-render with the column once it mounts.
  const [contentColumn, setContentColumn] = useState<HTMLDivElement | null>(null)

  // No network info is read here: the banner and `CurrentScreen` read it
  // themselves, so a new reading doesn't re-render the title bar and nav rail.
  return (
    // Dialogs anywhere in the shell, the update prompt's included, portal into
    // the content column, so they cover it and not the window.
    <PortalProvider container={contentColumn}>
      {/* The shell owns the app background and clips every child to the window
          edge. Square corners: the window is opaque (Tauri transparent:false,
          required so WebKitGTK renders reliably on Linux/NVIDIA — see run() in
          lib.rs), so a corner radius would just expose the window's background
          rather than the desktop. A hairline edge keeps the frameless window crisp. */}
      <div className="flex flex-col h-full bg-base border border-line overflow-hidden" data-app-shell>
        <UpdatePrompt />
        <AppTitleBar />

        {/* Everything below the full-width title bar: the nav rail, then the content column. */}
        <div className="flex flex-1 flex-row min-h-0 overflow-hidden">
          <TabBar />

          {/* The dialogs' portal container and positioning context. */}
          <div ref={setContentColumn} className="relative flex flex-1 flex-col min-w-0 overflow-hidden">
            <div className="flex flex-1 flex-col w-full min-h-0 overflow-hidden animate-fade-in">
              {/* A plain div, not a landmark: <main> inside it must be top-level. */}
              <div ref={scrollRef} className={SCROLL} data-scroll-root>
                <NetworkErrorBanner />

                <main ref={mainRef} className="flex flex-1 flex-col gap-10">
                  <CurrentScreen />
                </main>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PortalProvider>
  )
}
