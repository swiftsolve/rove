# The Traffic card

Part 5 of [The Home page, line by line](README.md).

[← What opens below it](04-connection-details.md) · [The Capabilities card →](06-capabilities-card.md)

The Traffic card shows how fast data is moving now, and a chart of the last minute. The Rust backend measures the network about once a second; a live store keeps the last minute of samples even while you're on another tab, so the chart is already full when you come back. The card reads that store; it never asks the backend itself.

Lines starting `// →` are this guide's notes; every other line is the real code, including its own comments.

## TrafficCard.tsx

[`src/features/live-throughput/TrafficCard.tsx`](../../../src/features/live-throughput/TrafficCard.tsx)

The card.

```tsx
// → The card's two parts: a big number with its unit, and the line chart.
import { SpeedReadout } from '@/features/live-throughput/components/SpeedReadout'
import { ThroughputChart } from '@/features/live-throughput/components/ThroughputChart'
// → Reads the live store: the latest sample and the last minute of history.
import { useLiveThroughput } from '@/features/live-throughput/hooks/useLiveThroughput'
// → Works out the chart's top value (its ceiling), so the line fills the
// → chart sensibly.
import { useThroughputScale } from '@/features/live-throughput/hooks/useThroughputScale'
// → Reads the rate at the right-hand end of the line, so the number and the
// → dot at "Now" agree.
import { headMbps } from '@/features/live-throughput/utils/throughput-chart'
// → Library pieces: the pulse icon, the card parts, and the green "Live"
// → badge.
import { ActivityIcon, Card, CardBody, CardHeader, LiveBadge } from '@/ui'

/**
 * Home's live traffic: the current download and upload rates over a chart of
 * the last minute. The rates are read off the chart's line at "Now", so the
 * numbers and the dots there agree.
 */
// → Starts the card. It takes no inputs: it reads everything itself.
export function TrafficCard() {
  // → The history: two lists of numbers, download and upload.
  const { history } = useLiveThroughput()
  // → The chart's ceiling, from both lists.
  const scaleMaxMbps = useThroughputScale(history.download, history.upload)

  return (
    <Card>
      // → The header: title, icon, and the "Live" badge on the right.
      <CardHeader title="Traffic" icon={<ActivityIcon size={15} />} actions={<LiveBadge />} />
      <CardBody>
        // → A two-column grid for the two numbers, 16px apart, with 12px
        // → below. `dl` is HTML for a list of labels and values.
        <dl className="mb-12 grid grid-cols-2 gap-16">
          {/* Each counts to the rate the chart's dot is heading to, once a sample. */}
          // → Each number gets its label, its rate and its direction, which
          // → sets the arrow and colour.
          <SpeedReadout label="Download" mbps={headMbps(history.download, 1)} series="down" />
          <SpeedReadout label="Upload" mbps={headMbps(history.upload, 1)} series="up" />
        </dl>

        {/* Bleeds to the card edges, then pads the graph back in line with the title. */}
        // → A sunken grey band for the chart. The negative margins stretch it
        // → to the card's edges; the padding brings the chart back in line
        // → with the title.
        <div className="-mx-(--card-body-padding) -mb-(--card-body-padding) bg-inset p-(--card-body-padding)">
          // → The chart, given both lines and its ceiling.
          <ThroughputChart download={history.download} upload={history.upload} maxMbps={scaleMaxMbps} />
        </div>
      </CardBody>
    </Card>
  )
}
```

## SpeedReadout.tsx

[`src/features/live-throughput/components/SpeedReadout.tsx`](../../../src/features/live-throughput/components/SpeedReadout.tsx)

One big number.

```tsx
// → The arrow icon, the library's number-with-unit display, the down/up type,
// → and a helper that animates a number counting up.
import { DirectionIcon, Readout, type SpeedSeries, useCountUp } from '@/ui'
// → Splits a rate into a value and a unit: 186 and Mbps, or 1.24 and Gbps.
import { splitSpeedMbps } from '@/utils/format'

/**
 * Rates below this are background noise (OS chatter, keepalives), shown as zero
 * so the readout doesn't sit at 0.1 when nothing is transferring.
 */
// → Below 0.1 Mbps is background chatter, so it's shown as zero.
const NOISE_FLOOR_MBPS = 0.1

// → What it's given: a label, a rate and a direction.
type SpeedReadoutProps = {
  label: string
  mbps: number
  series: SpeedSeries
}

/**
 * A live rate behind its direction arrow. The digits count up to each new
 * sample; screen readers get the settled value instead of a mid-count one.
 */
// → Starts the readout.
export function SpeedReadout({ label, mbps, series }: SpeedReadoutProps) {
  // → Rounds tiny rates down to zero.
  const settledMbps = mbps < NOISE_FLOOR_MBPS ? 0 : mbps
  // → The number that animates towards the real value.
  const countingMbps = useCountUp(settledMbps)
  // → The animating number and the final one, each split into value and unit.
  const shown = splitSpeedMbps(countingMbps)
  const settled = splitSpeedMbps(settledMbps)

  return (
    // → Draws the label, arrow, number and unit. spokenValue is what a screen
    // → reader hears: the final value. `min-w-0 flex-1` shares the row
    // → evenly.
    <Readout
      className="min-w-0 flex-1"
      label={label}
      icon={<DirectionIcon series={series} />}
      value={shown.value}
      unit={shown.unit}
      spokenValue={`${settled.value} ${settled.unit}`}
    />
  )
}
```

[← What opens below it](04-connection-details.md) · [The Capabilities card →](06-capabilities-card.md)
