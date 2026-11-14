import { cx } from 'class-variance-authority'
import type { ReactNode } from 'react'

import { LAYER_CHROME } from '../utils/layers'

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
