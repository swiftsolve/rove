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
          {/* The brand mark: just the icon, in the accent colour, no tile. */}
          <span className="inline-flex items-center justify-center shrink-0 text-accent" aria-hidden>
            <BrandIcon size={22} />
          </span>
          <span className="text-2xl font-semibold tracking-heading-large text-primary">Rove</span>
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
