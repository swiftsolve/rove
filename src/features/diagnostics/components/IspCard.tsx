import type { ReactNode } from 'react'

import { formatLocation } from '@/features/diagnostics/utils/diagnostics-display'
import { ServiceIcon } from '@/features/services/components/ServiceIcon'
import type { IspInfo, NetworkDiagnostics } from '@/types'
import { Badge, Card, CardBody, CardHeader, DataList, DataRow, GlobeIcon } from '@/ui'

// "VPN" when the egress is a hosting ASN, else the brand mark if one resolves.
// No monogram fallback: many ISPs have no favicon, and a lone letter reads as a glitch.
function ispBadge(isp: IspInfo | null | undefined): ReactNode {
  if (isp?.isVpn) return <Badge tone="positive">VPN</Badge>
  if (isp?.domain) {
    return <ServiceIcon host={isp.domain} name={isp.name ?? 'ISP'} size={18} fallback="none" />
  }
  return undefined
}

export function IspCard({ diagnostics }: { diagnostics: NetworkDiagnostics | null }) {
  const isp = diagnostics?.isp

  return (
    <Card>
      <CardHeader title={isp?.isVpn ? 'VPN' : 'ISP'} icon={<GlobeIcon size={15} />} actions={ispBadge(isp)} />
      <CardBody>
        {isp ? (
          <DataList density="compact">
            {/* "Provider", not "ISP": under a VPN this is the exit node's host. */}
            <DataRow label="Provider" value={isp.name} />
            {/* "Website", not "Domain", which reads as a DHCP search domain here. */}
            <DataRow label="Website" value={isp.domain} />
            <DataRow label="ASN" value={isp.asn} />
            <DataRow label="Public IP" value={isp.publicIp} />
            <DataRow label="Location" value={formatLocation(isp)} />
          </DataList>
        ) : (
          // Reached only without a public IP, usually offline. The copy checks the
          // internet state so an echo-service blip doesn't claim we're offline.
          <p className="type-body-small text-tertiary">
            {diagnostics?.internet === 'online'
              ? 'Provider details are momentarily unavailable.'
              : 'Provider details are unavailable offline.'}
          </p>
        )}
      </CardBody>
    </Card>
  )
}
