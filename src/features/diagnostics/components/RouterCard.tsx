import type { ReactNode } from 'react'

import { useNetwork } from '@/app/hooks/useNetwork'
import { formatPercent, latencyStatus, lossStatus, sameText } from '@/features/diagnostics/utils/diagnostics-display'
import type { NetworkDiagnostics, PingStats } from '@/types'
import { getLinkCapacityMbps, isMeasuredLatency } from '@/types'
import {
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  DataList,
  DataListStack,
  DataRow,
  MetricValue,
  NoValue,
  RouterIcon,
} from '@/ui'
import { formatLatencyMs, formatSpeedMbps } from '@/utils/format'

function latencyValue(ping: PingStats | null | undefined): ReactNode {
  if (ping == null) return <NoValue />
  if (!isMeasuredLatency(ping.avgMs)) return <span className="text-negative">Down</span>
  return <MetricValue value={ping.avgMs} status={latencyStatus(ping.avgMs)} format={formatLatencyMs} />
}

function jitterValue(ping: PingStats | null | undefined): ReactNode {
  if (ping == null) return <NoValue />
  if (!isMeasuredLatency(ping.jitterMs)) return 'Down'
  return <MetricValue value={ping.jitterMs} format={formatLatencyMs} />
}

export function RouterCard({ diagnostics }: { diagnostics: NetworkDiagnostics | null }) {
  const { info } = useNetwork()
  const ping = diagnostics?.gatewayPing
  const linkSpeedMbps = info ? getLinkCapacityMbps(info) : null
  // Many routers report their model as their name too; show it once.
  const model = sameText(diagnostics?.gatewayModel, diagnostics?.gatewayName) ? null : diagnostics?.gatewayModel || null
  const hasDeviceRows = Boolean(diagnostics?.gatewayName || model || diagnostics?.gatewayVendor)

  return (
    <Card>
      <CardHeader title="Router" icon={<RouterIcon size={15} />} />
      <CardBody layout="flush">
        <DataListStack>
          <DataList density="compact">
            <DataRow label="Latency">{latencyValue(ping)}</DataRow>
            <DataRow label="Jitter">{jitterValue(ping)}</DataRow>
            <DataRow label="Packet loss">
              {ping ? (
                <MetricValue value={ping.packetLoss} status={lossStatus(ping.packetLoss)} format={formatPercent} />
              ) : (
                <NoValue />
              )}
            </DataRow>
          </DataList>
          <DataList density="compact">
            <DataRow label="Gateway">{diagnostics?.gateway ?? <NoValue />}</DataRow>
            <DataRow label="Interface">{diagnostics?.defaultInterface ?? <NoValue />}</DataRow>
            {linkSpeedMbps != null && (
              <DataRow label="Link speed">
                <MetricValue value={linkSpeedMbps} format={formatSpeedMbps} />
              </DataRow>
            )}
          </DataList>
          {hasDeviceRows && (
            <DataList density="compact">
              <DataRow label="Name" value={diagnostics?.gatewayName || null} />
              <DataRow label="Model" value={model} />
              <DataRow label="Vendor" value={diagnostics?.gatewayVendor || null} />
            </DataList>
          )}
        </DataListStack>
      </CardBody>
      {ping && ping.packetLoss > 0 && (
        <CardFooter>
          <p className="type-body text-tertiary">Packet loss can cause slow or unstable connections.</p>
        </CardFooter>
      )}
    </Card>
  )
}
