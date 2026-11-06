import { cva, cx } from 'class-variance-authority'
import type { ReactNode } from 'react'

import { CloseIcon, MinimizeIcon } from '../icons/Icons'
import { StatusDot } from '../status-dot/StatusDot'
import { LAYER_CHROME } from '../utils/layers'
import { STATUS_TEXT } from '../utils/status'
import type { VariantOf } from '../utils/variants'

type TitleBarProps = {
  /** The product mark and name, at the start. */
  brand: ReactNode
  /** Beside the brand: a TitleBarStatus. */
  status?: ReactNode
  /** At the end: WindowButtons, on a frameless window. */
  controls?: ReactNode
}

/**
 * The full-width bar across the window's top, which drags the window. It
 * stays above the scrolling content and its dialogs; only menus and tooltips,
 * which float, paint over it.
 */
export function TitleBar({ brand, status, controls }: TitleBarProps) {
  return (
    // The left inset aligns the brand with the nav rail below; the right keeps
    // the controls at the standard header edge.
    <header
      className={cx(
        'relative flex min-h-(--titlebar-height) shrink-0 items-center justify-between',
        'border-b border-line bg-chrome pr-(--card-header-padding-x) pl-16 [-webkit-app-region:drag]',
        LAYER_CHROME,
      )}
      data-tauri-drag-region
    >
      <div className="inline-flex min-w-0 items-center gap-12">
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
const statusVariants = cva(['type-label-small', 'mt-px inline-flex items-center gap-6 [-webkit-app-region:no-drag]'], {
  variants: {
    tone: {
      positive: STATUS_TEXT.positive,
      negative: STATUS_TEXT.negative,
      neutral: 'text-tertiary',
    },
  },
})

type TitleBarStatusProps = {
  /**
   * `positive` when connected; `negative`, connected but something's wrong
   * beyond the link; `neutral`, connecting or offline, with a still dot.
   */
  tone: VariantOf<typeof statusVariants, 'tone'>
  /** The status in words: "Connected". */
  children: ReactNode
}

/** The connection status beside the brand: a dot (pulsing unless neutral) and its words, announced as they change. */
export function TitleBarStatus({ tone, children }: TitleBarStatusProps) {
  return (
    <span className={statusVariants({ tone })} role="status">
      <StatusDot pulse={tone === 'neutral' ? undefined : 'calm'} />
      {children}
    </span>
  )
}

const windowButtonVariants = cva(
  [
    'inline-flex h-[26px] w-[28px] items-center justify-center rounded-xs text-tertiary',
    'transition-[color,background] duration-(--duration-fast) ease-in-out',
  ],
  {
    variants: {
      action: {
        minimize: 'hover:bg-hover hover:text-primary',
        close: 'hover:bg-status-negative-solid hover:text-on-solid',
      },
    },
  },
)

const WINDOW_ACTIONS = {
  minimize: { label: 'Minimize', icon: MinimizeIcon },
  close: { label: 'Close', icon: CloseIcon },
}

type WindowButtonProps = {
  /** Which button: its icon, its name, and (for `close`) a red hover. */
  action: VariantOf<typeof windowButtonVariants, 'action'>
  /** Minimises or closes the window. */
  onClick: () => void
}

/**
 * Minimise or close the window. Out of the Tab order, like a native title
 * bar's: otherwise the first Tab lands here instead of the nav rail, and a
 * stray Enter closes the window.
 */
export function WindowButton({ action, onClick }: WindowButtonProps) {
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
