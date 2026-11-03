import { DnsCard } from '@/features/diagnostics/components/DnsCard'
import { IspCard } from '@/features/diagnostics/components/IspCard'
import { RouterCard } from '@/features/diagnostics/components/RouterCard'
import { useDiagnostics } from '@/features/diagnostics/hooks/useDiagnostics'
import { runStatusText } from '@/features/diagnostics/utils/diagnostics-display'
import { Banner, ConnectionIcon, HelpIcon, IconButton, LoadingState, PageHeader, RefreshIcon } from '@/ui'

const DIAGNOSTICS_HINT =
  'Latency pings your router, and some routers answer slowly on purpose. ISP details come from your public IP.'

export function DiagnosticsView() {
  const { diagnostics, isRunning, error, run } = useDiagnostics()
  const runDiagnostics = (): void => {
    void run()
  }
  const hasDiagnostics = diagnostics != null
  const isFirstCheck = isRunning && !diagnostics

  return (
    <div className="page">
      <PageHeader
        icon={<ConnectionIcon size={18} />}
        title="Connection"
        description={hasDiagnostics ? 'Router, DNS, and ISP' : null}
        status={isRunning ? 'Checking…' : undefined}
        actions={
          <>
            <IconButton label="About connection checks" icon={HelpIcon} tooltip={DIAGNOSTICS_HINT} />
            <IconButton label="Run again" icon={RefreshIcon} isLoading={isRunning} onClick={runDiagnostics} />
          </>
        }
      />

      <p className="sr-only" role="status">
        {runStatusText(isRunning, hasDiagnostics)}
      </p>

      {error && (
        <Banner
          variant="error"
          title={error}
          description={diagnostics ? 'Showing the last check.' : 'Try again in a moment.'}
          onRetry={run}
        />
      )}

      {isFirstCheck ? (
        <LoadingState label="Checking your connection…" />
      ) : (
        <>
          <RouterCard diagnostics={diagnostics} />
          <DnsCard servers={diagnostics?.dnsServers ?? []} />
          <IspCard diagnostics={diagnostics} />
        </>
      )}
    </div>
  )
}
