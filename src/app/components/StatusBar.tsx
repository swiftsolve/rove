import { cva, cx } from 'class-variance-authority'
import { BrandIcon, CloseIcon, MinimizeIcon } from '@/components/icons/Icons'
import { useConnectionStatus } from '@/app/hooks/useConnectionStatus'

// Nudged down a hair so the label optically aligns with the wordmark's centre
// rather than sitting slightly high next to it.
const linkVariants = cva(
  ['text-label-small', 'inline-flex items-center gap-6 mt-px [-webkit-app-region:no-drag]'],
  {
    variants: {
      tone: {
        positive: 'text-positive',
        /** Link up, but the public internet is unreachable: red, to set it apart
         *  from both the green "connected" and the neutral offline states. */
        negative: 'text-negative',
        /** Connecting or offline: the base look. */
        neutral: null,
      },
    },
  },
)

const dotVariants = cva('size-[5px] rounded-full bg-current', {
  variants: {
    tone: {
      positive: 'animate-[status-pulse_2.4s_ease-in-out_infinite]',
      negative: 'animate-[status-pulse_2.4s_ease-in-out_infinite]',
      neutral: null,
    },
  },
})

const windowButtonVariants = cva(
  [
    'inline-flex items-center justify-center w-[28px] h-[26px] rounded-xs text-tertiary',
    'transition-[color,background] duration-(--duration-fast) ease-in-out',
  ],
  {
    variants: {
      action: {
        minimize: 'hover:bg-hover hover:text-primary',
        close: 'hover:bg-status-negative-fill hover:text-on-fill',
      },
    },
  },
)

// Kept out of the Tab order, like a native title bar: otherwise the first Tab
// lands on Minimize/Close at the top-right instead of the nav rail, and a stray
// Enter closes the window.
function WindowControls(): JSX.Element {
  const controls = window.windowControls
  if (!controls) return <></>

  return (
    <div className="inline-flex items-center gap-6 [-webkit-app-region:no-drag]">
      <button
        type="button"
        className={windowButtonVariants({ action: 'minimize' })}
        onClick={() => controls.minimize()}
        aria-label="Minimize"
        tabIndex={-1}
      >
        <MinimizeIcon size={15} />
      </button>
      <button
        type="button"
        className={windowButtonVariants({ action: 'close' })}
        onClick={() => controls.close()}
        aria-label="Close"
        tabIndex={-1}
      >
        <CloseIcon size={15} />
      </button>
    </div>
  )
}

/** The full-width title bar: brand, connection status and window controls. */
export function StatusBar(): JSX.Element {
  const { tone, label } = useConnectionStatus()
  return (
    // The left inset aligns the brand mark with the nav rail below; the right
    // keeps the window controls at the standard header edge. The bar stays above
    // the scrolling content, so nothing (buttons, tooltips, escaped absolutes)
    // can ever paint over it.
    <header
      className={cx(
        'relative z-100 flex items-center justify-between shrink-0 min-h-(--titlebar-height)',
        'pl-16 pr-(--card-header-padding-x) bg-base border-b border-line [-webkit-app-region:drag]',
      )}
      data-tauri-drag-region
    >
      <div className="inline-flex items-center gap-12 min-w-0">
        <div className="inline-flex items-center gap-8 [-webkit-app-region:drag]">
          {/* The brand mark: just the glyph, in the accent colour, no tile. */}
          <span className="inline-flex items-center justify-center shrink-0 text-accent" aria-hidden>
            <BrandIcon size={22} />
          </span>
          <span className="text-2xl font-semibold tracking-heading-large text-primary">Rove</span>
        </div>
        {/* Polite live region: the link state changes on its own. */}
        <span className={linkVariants({ tone })} role="status">
          <span className={dotVariants({ tone })} aria-hidden />
          {label}
        </span>
      </div>
      <WindowControls />
    </header>
  )
}
