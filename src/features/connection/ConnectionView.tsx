import { useNetwork } from '@/app/hooks/useNetwork'
import { DnsCard } from '@/features/connection/components/DnsCard'
import { IspCard } from '@/features/connection/components/IspCard'
import { PathCard } from '@/features/connection/components/PathCard'
import { RouterCard } from '@/features/connection/components/RouterCard'
import { useDiagnostics } from '@/features/connection/hooks/useDiagnostics'
import { useFinishedCheckCount } from '@/features/connection/hooks/useFinishedCheckCount'
import { runStatusText } from '@/features/connection/utils/diagnostics-display'
import { Banner, ConnectionIcon, IconButton, LoadingState, PageHeader, RefreshIcon, ScreenReaderStatus } from '@/ui'

const DIAGNOSTICS_HINT =
  'Latency pings your router, and some routers answer slowly on purpose. ISP details come from your public IP.'

export function ConnectionView() {
  const { diagnostics, isRunning, error, run } = useDiagnostics()
  const isConnected = useNetwork().info?.isConnected ?? false
  const finishedCheckCount = useFinishedCheckCount(isRunning)
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
        // The spinning Refresh button shows a check is running, so the
        // description stays put rather than giving way to a status.
        description="Your path to the internet"
        // Off a router there's nothing to check, so no Refresh.
        actions={
          isConnected ? (
            <IconButton
              label={isRunning ? 'Refreshing…' : 'Refresh'}
              icon={RefreshIcon}
              isLoading={isRunning}
              onClick={runDiagnostics}
            />
          ) : undefined
        }
        info={{ label: 'About connection checks', hint: DIAGNOSTICS_HINT }}
      />

      <ScreenReaderStatus>{isConnected ? runStatusText(isRunning, hasDiagnostics) : ''}</ScreenReaderStatus>

      {isConnected && error && (
        <Banner
          variant="error"
          title={error}
          description={diagnostics ? 'Showing the last check.' : 'Try again in a moment.'}
          onRetry={run}
        />
      )}

      {isConnected && isFirstCheck && <LoadingState label="Checking your connection…" />}

      {/* Off a router, only the Path card shows: it says where the break is,
          and the router, ISP and DNS cards would be all dashes. */}
      {!(isConnected && isFirstCheck) && (
        <PathCard
          diagnostics={isConnected ? diagnostics : null}
          isCheckFailing={error != null}
          finishedCheckCount={finishedCheckCount}
        />
      )}
      {isConnected && !isFirstCheck && (
        <>
          <RouterCard diagnostics={diagnostics} />
          <IspCard diagnostics={diagnostics} />
          <DnsCard servers={diagnostics?.dnsServers ?? []} />
        </>
      )}
    </div>
  )
}
