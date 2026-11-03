import { Card, CardBody, CardHeader, DataList, DataRow, DnsIcon } from '@/ui'

export function DnsCard({ servers }: { servers: string[] }) {
  return (
    <Card>
      <CardHeader title="DNS" icon={<DnsIcon size={15} />} />
      <CardBody>
        {servers.length > 0 ? (
          <DataList density="compact">
            {servers.map((server) => (
              <DataRow key={server} label="Server" value={server} />
            ))}
          </DataList>
        ) : (
          <p className="type-body-small text-tertiary">No DNS servers found.</p>
        )}
      </CardBody>
    </Card>
  )
}
