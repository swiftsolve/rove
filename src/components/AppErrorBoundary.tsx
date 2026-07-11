import { Component, type ReactNode } from 'react'

interface AppErrorBoundaryProps {
  readonly children: ReactNode
}

interface AppErrorBoundaryState {
  readonly error: Error | null
}

/**
 * Last-resort boundary around the whole app: a crashed render shows a short,
 * friendly notice instead of a blank window. The message and stack are only
 * rendered in dev builds — end users never see a raw stack trace.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error }
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="view-empty" style={{ height: '100vh' }} role="alert">
        <p className="text-muted">Something went wrong. Please restart Rove.</p>
        {import.meta.env.DEV && (
          <pre
            style={{
              font: '11px/1.5 monospace',
              color: 'var(--text-tertiary)',
              whiteSpace: 'pre-wrap',
              maxWidth: '80ch',
              userSelect: 'text',
            }}
          >
            {`${error.message}\n${error.stack ?? ''}`}
          </pre>
        )}
      </div>
    )
  }
}
