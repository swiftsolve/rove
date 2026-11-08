import { useConnectionStatus } from '@/app/hooks/useConnectionStatus'
import { BrandIcon, TitleBar, TitleBarStatus, WindowButton } from '@/ui'

/** The window's title bar: Rove's mark, the connection status and, on a frameless window, its controls. */
export function AppTitleBar() {
  const { tone, label } = useConnectionStatus()
  const controls = window.windowControls
  return (
    <TitleBar
      brand={
        <>
          {/* Down 1px: the mark's ink sits high in its box (open at the bottom), so
              this centres it on the wordmark's capitals. */}
          <span className="inline-flex shrink-0 translate-y-px text-accent">
            <BrandIcon size={22} />
          </span>
          <span className="type-title leading-body text-primary">Rove</span>
        </>
      }
      status={<TitleBarStatus tone={tone}>{label}</TitleBarStatus>}
      controls={
        controls && (
          <>
            <WindowButton action="minimize" onClick={() => controls.minimize()} />
            <WindowButton action="close" onClick={() => controls.close()} />
          </>
        )
      }
    />
  )
}
