# `HomeView.tsx`: the page itself

Part 2 of [The Home page, line by line](README.md).

[← The big picture](01-overview.md) · [The network card →](03-connection-card.md)

The page decides which cards appear and in what order; it draws nothing itself.

Lines starting `// →` are this guide's notes; every other line is the real code, including its own comments.

## HomeView.tsx

[`src/features/home/HomeView.tsx`](../../../src/features/home/HomeView.tsx)

40 lines.

```tsx
// → Borrows the name JSX from React, only so the code can say what the
// → function returns. `type` means it vanishes when the app is built.
import type { JSX } from 'react'

// → useNetwork hands over what Rove knows about the current network: Wi-Fi or
// → Ethernet, its name, its speed.
import { useNetwork } from '@/app/hooks/useNetwork'
// → The five cards the page is built from. Each lives in its own file.
import { CapabilitiesCard } from '@/features/capabilities/CapabilitiesCard'
import { ConnectionCard } from '@/features/connection/ConnectionCard'
import { DevicesCard } from '@/features/home/components/DevicesCard'
import { UsageCard } from '@/features/home/components/UsageCard'
import { TrafficCard } from '@/features/live-throughput/TrafficCard'
// → The speed test's shared memory, so the page can ask whether there are any
// → results.
import { useSpeedTest } from '@/features/speed/hooks/useSpeedTest'
// → A yes/no helper: is this network actually connected?
import { isConnectedNetwork } from '@/types'

// → Starts the page. `export` lets other files use it. It returns screen
// → content, or null, which means "show nothing".
export function HomeView(): JSX.Element | null {
  // → Reads the network info and keeps it in `info`.
  const { info } = useNetwork()
  // Earlier results keep the capability strip on screen even while offline.
  // → True or false: does the speed-test memory hold any capability ratings?
  const hasCapabilities = useSpeedTest((test) => test.capabilities.length > 0)

  // Home can't render without network info; the shell shows its own state until then.
  // → No network info yet: draw nothing. The app's frame shows its own
  // → loading screen meanwhile.
  if (!info) return null

  // → Works out once whether you're connected, and keeps the answer.
  const isConnected = isConnectedNetwork(info)

  return (
    // → Starts the screen content. The `page` class stacks the cards in a
    // → column with even gaps, and fades them in one after another.
    <div className="page">
      {/* No visible title on Home, but every screen needs an h1: it names the
          page for screen readers and is where focus lands on navigation. */}
      // → A title only screen readers hear (`sr-only` hides it visually).
      // → Every screen needs one, and keyboard focus lands on it when you
      // → switch tabs.
      <h1 className="sr-only">Home</h1>
      // → The network card, always shown. It's handed `info` so it knows what
      // → to display.
      <ConnectionCard info={info} />

      // → The live traffic chart, only when connected. `A && B` means "if A
      // → is true, show B".
      {isConnected && <TrafficCard />}
      // → The capabilities row, when connected OR when earlier results exist.
      // → `||` means "or".
      {(isConnected || hasCapabilities) && <CapabilitiesCard />}

      {/* Two different summaries side by side, not a list: each card is its own
          section. Usage carries two numbers, so it gets the wider column. */}
      // → A two-column row: the left column gets 3 parts of the width, the
      // → right 2, because Usage shows two numbers and Devices one. `gap-10`
      // → puts 10px between them.
      <div className="grid grid-cols-[3fr_2fr] gap-10">
        // → The two small summary cards in that row.
        <UsageCard />
        <DevicesCard />
      // → Closing tags: the row, the page, then the function.
      </div>
    </div>
  )
}
```

[← The big picture](01-overview.md) · [The network card →](03-connection-card.md)
