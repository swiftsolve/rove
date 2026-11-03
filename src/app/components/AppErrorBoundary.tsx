import { cva } from 'class-variance-authority'
import { Component, type ReactNode } from 'react'

import { Button, RefreshIcon } from '@/ui'

const fallbackVariants = cva('page-empty', {
  variants: {
    /** The whole window, with no app frame left around it. */
    isApp: { true: 'h-screen' },
  },
  defaultVariants: { isApp: false },
})

type AppErrorBoundaryProps = {
  /** Around the whole app, the last resort; otherwise around one screen, so the
   *  title bar and nav rail survive it and another tab still opens. */
  isApp?: boolean
  children: ReactNode
}

type AppErrorBoundaryState = {
  error: Error | null
}

/**
 * Catches a crashed render and shows a short notice with Reload instead of a
 * blank window. The message and stack are shown only in dev builds; end users
 * never see a raw stack trace, but it's logged either way.
 *
 * Around a screen, key it by the location, so moving to another screen clears it.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    console.error('Render crashed:', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    const { isApp = false, children } = this.props
    if (!error) return children

    return (
      <div className={fallbackVariants({ isApp })} role="alert">
        <p className="type-body-default text-tertiary">
          {isApp ? 'Something went wrong.' : 'This screen couldn’t load.'}
        </p>
        <Button icon={RefreshIcon} onClick={() => window.location.reload()}>
          Reload
        </Button>
        {import.meta.env.DEV && (
          <pre className="type-caption text-tertiary whitespace-pre-wrap select-text max-w-full">
            {`${error.message}\n${error.stack ?? ''}`}
          </pre>
        )}
      </div>
    )
  }
}
