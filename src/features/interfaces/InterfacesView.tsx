import { InterfacePanel } from '@/features/interfaces/components/InterfacePanel'
import { useNetworkInterfaces } from '@/features/interfaces/hooks/useNetworkInterfaces'
import { interfacesTitle, interfaceTypeSummaryParts } from '@/features/interfaces/utils/interface-summary'
import type { NetworkInterfaceSummary } from '@/types'
import {
  Banner,
  Button,
  EmptyState,
  IconButton,
  InlineMeta,
  LayersIcon,
  LoadingState,
  PageHeader,
  RefreshIcon,
} from '@/ui'
import { POLLING_DESCRIPTION } from '@/utils/copy'

/** The page body: a first-load spinner, an empty state with a retry, or the interface panels. */
function InterfacesBody({
  interfaces,
  isLoading,
  onRefresh,
}: {
  interfaces: NetworkInterfaceSummary[]
  isLoading: boolean
  onRefresh: () => void
}) {
  if (isLoading && interfaces.length === 0) {
    return <LoadingState label="Loading network interfaces…" />
  }
  if (interfaces.length === 0) {
    return <EmptyState title="No network interfaces found" actions={<Button onClick={onRefresh}>Refresh</Button>} />
  }
  return (
    <ul role="list" aria-label="Network interfaces" aria-busy={isLoading} className="flex flex-col gap-10">
      {interfaces.map((iface) => (
        <InterfacePanel key={iface.name} iface={iface} />
      ))}
    </ul>
  )
}

export function InterfacesView() {
  const { interfaces, isLoading, error, refresh } = useNetworkInterfaces()
  const onRefresh = (): void => void refresh()

  return (
    <div className="page">
      <PageHeader
        icon={<LayersIcon size={18} />}
        title={interfacesTitle(interfaces.length)}
        description={
          interfaces.length > 0 ? (
            <InlineMeta shouldTruncate items={interfaceTypeSummaryParts(interfaces)} />
          ) : undefined
        }
        actions={<IconButton label="Refresh" icon={RefreshIcon} isLoading={isLoading} onClick={onRefresh} />}
      />

      {error && <Banner variant="error" title={error} description={POLLING_DESCRIPTION} onRetry={refresh} />}

      <InterfacesBody interfaces={interfaces} isLoading={isLoading} onRefresh={onRefresh} />
    </div>
  )
}
