import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { DisconnectedNetworkInfo, EthernetNetworkInfo } from '@/types'
import { Collapsible } from '@/ui'

import { ConnectionStrip } from './ConnectionStrip'

const BASE = { interfaceName: 'en0', ipAddress: null, gateway: null, macAddress: null, dns: [] }

const OFFLINE: DisconnectedNetworkInfo = { ...BASE, connectionType: 'unknown', isConnected: false }

const ETHERNET: EthernetNetworkInfo = {
  ...BASE,
  connectionType: 'ethernet',
  isConnected: true,
  linkSpeedMbps: 1000,
  duplex: 'full',
  vendor: null,
  product: null,
}

describe('ConnectionStrip', () => {
  it('offers the details on a connected network', () => {
    render(
      <Collapsible isOpen={false} onOpenChange={() => {}}>
        <ConnectionStrip info={ETHERNET} titleId="title" isExpanded={false} />
      </Collapsible>,
    )
    expect(screen.getByRole('button', { name: 'Connection details' })).toBeInTheDocument()
    expect(document.querySelector('svg.lucide-chevron-down')).toBeInTheDocument()
  })

  it('has nothing to open with no details', () => {
    const { container } = render(<ConnectionStrip info={OFFLINE} titleId="title" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(container.querySelector('svg.lucide-chevron-down')).not.toBeInTheDocument()
  })
})
