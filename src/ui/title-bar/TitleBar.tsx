import type { ReactNode } from 'react'
import { cva, cx } from 'class-variance-authority'
import type { VariantOf } from '../foundations/variants'
import { StatusDot } from '../status-dot/StatusDot'
import { CloseIcon, MinimizeIcon } from '../icons/Icons'

interface TitleBarProps {
  /** The product mark and name, at the start. */
  brand: ReactNode
  /** Beside the brand: a TitleBarStatus. */
  status?: ReactNode
  /** At the end: WindowButtons, on a frameless window. */
  controls?: ReactNode
}

/**
 * The full-width bar across the window's top, which drags the window. It
 * stays above the scrolling content, so nothing (buttons, tooltips, escaped
 * absolutes) can ever paint over it.
 */
export function TitleBar({ brand, status, controls }: TitleBarProps): JSX.Element {
  return (
    // The left inset aligns the brand with the nav rail below; the right keeps
    // the controls at the standard header edge.
    <header
      className={cx(
        'relative z-100 flex items-center justify-between shrink-0 min-h-(--titlebar-height)',
        'pl-16 pr-(--card-header-padding-x) bg-base border-b border-line [-webkit-app-region:drag]',
      )}
      data-tauri-drag-region
    >
      <div className="inline-flex items-center gap-12 min-w-0">
        <div className="inline-flex items-center gap-8 [-webkit-app-region:drag]">{brand}</div>
        {status}
      </div>
      {controls != null && (
        <div className="inline-flex items-center gap-6 [-webkit-app-region:no-drag]">{controls}</div>
      )}
    </header>
  )
}

// Nudged down a hair so the label optically aligns with the wordmark's centre
// rather than sitting slightly high next to it.
const statusVariants = cva(
  ['text-label-small', 'inline-flex items-center gap-6 mt-px [-webkit-app-region:no-drag]'],
  {
    variants: {
      tone: {
        positive: 'text-positive',
        /** Connected, but something's wrong beyond the link: red. */
        negative: 'text-negative',
        /** Connecting or offline: the base look. */
        neutral: null,
      },
    },
  },
)

interface TitleBarStatusProps {
  tone: VariantOf<typeof statusVariants, 'tone'>
  children: ReactNode
}

/** The connection status beside the brand: a dot (pulsing unless neutral) and its words, announced as they change. */
export function TitleBarStatus({ tone, children }: TitleBarStatusProps): JSX.Element {
  return (
    <span className={statusVariants({ tone })} role="status">
      <StatusDot pulse={tone === 'neutral' ? undefined : 'calm'} />
      {children}
    </span>
  )
}

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

const WINDOW_ACTIONS = {
  minimize: { label: 'Minimize', icon: MinimizeIcon },
  close: { label: 'Close', icon: CloseIcon },
}

interface WindowButtonProps {
  action: VariantOf<typeof windowButtonVariants, 'action'>
  onClick: () => void
}

/**
 * Minimise or close the window. Out of the Tab order, like a native title
 * bar's: otherwise the first Tab lands here instead of the nav rail, and a
 * stray Enter closes the window.
 */
export function WindowButton({ action, onClick }: WindowButtonProps): JSX.Element {
  const { label, icon: Icon } = WINDOW_ACTIONS[action]
  return (
    <button
      type="button"
      className={windowButtonVariants({ action })}
      onClick={onClick}
      aria-label={label}
      tabIndex={-1}
    >
      <Icon size={15} />
    </button>
  )
}
