import type { NetworkInterfaceSummary } from '@/types'
import { countTitle } from '@/utils/format'

type InterfaceCategory = 'wifi' | 'ethernet' | 'virtual' | 'other'

/** Each category's label, in the order the summary lists them. */
const CATEGORY_LABELS: [category: InterfaceCategory, label: string][] = [
  ['wifi', 'Wi‑Fi'],
  ['ethernet', 'Ethernet'],
  ['virtual', 'Virtual'],
  ['other', 'Other'],
]

/** Per-category counts, e.g. ["1 Wi‑Fi", "1 Ethernet", "2 Virtual"]. */
export function interfaceTypeSummaryParts(interfaces: NetworkInterfaceSummary[]): string[] {
  const counts: Record<InterfaceCategory, number> = { wifi: 0, ethernet: 0, virtual: 0, other: 0 }
  for (const iface of interfaces) {
    if (iface.isVirtual) counts.virtual++
    else if (iface.connectionType === 'wifi') counts.wifi++
    else if (iface.connectionType === 'ethernet') counts.ethernet++
    else counts.other++
  }

  return CATEGORY_LABELS.filter(([category]) => counts[category] > 0).map(
    ([category, label]) => `${counts[category]} ${label}`,
  )
}

/** "2 interfaces" once some are listed, else the plain page name. */
export function interfacesTitle(count: number): string {
  return countTitle(count, 'interface', 'Interfaces')
}
