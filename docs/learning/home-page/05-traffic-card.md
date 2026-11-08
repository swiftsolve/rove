# The Traffic card

Part 5 of [The Home page, line by line](README.md).

[← What opens below it](04-connection-details.md) · [The Capabilities card →](06-capabilities-card.md)

The Traffic card shows how fast data is moving right now, and a chart of the
last minute. The card itself,
[`TrafficCard.tsx`](../../../src/features/live-throughput/TrafficCard.tsx), is
34 lines; the numbers come from
[`SpeedReadout.tsx`](../../../src/features/live-throughput/components/SpeedReadout.tsx)
(36 lines).

## Where the numbers come from

The Rust backend measures the network about once a second and sends each
sample to the UI. A live store (`useLiveThroughput`) keeps the last minute of
samples, even while you're on another tab, so the chart is already full when
you come back. The card reads that store; it never asks the backend itself.

## `TrafficCard.tsx`

| Line | Code | What it means |
| --- | --- | --- |
| 1–2 | `SpeedReadout`, `ThroughputChart` | The two parts of the card: a big number with its unit, and the line chart. |
| 3 | `useLiveThroughput` | Reads the live store: the latest sample and the last minute of history. |
| 4 | `useThroughputScale` | Works out the chart's top value (its ceiling), so the line fills the chart sensibly. |
| 5 | `headMbps` | Reads the rate at the right-hand end of the chart's line, so the number and the dot at "Now" agree. |
| 6 | `ActivityIcon, Card, CardBody, CardHeader, LiveBadge` | Library pieces: the pulse icon, the card parts, and the green "Live" badge. |
| 8–12 | doc comment | The card shows the current rates over a chart of the last minute, and the rates are read off the line so they match. |
| 13 | `export function TrafficCard()` | Starts the card. It takes no inputs: it reads everything itself. |
| 14 | `const { history } = useLiveThroughput()` | Takes the history (two lists of numbers, download and upload) from the store. |
| 15 | `const scaleMaxMbps = useThroughputScale(…)` | Works out the chart's ceiling from both lists. |
| 17–19 | `<Card>` `<CardHeader title="Traffic" … actions={<LiveBadge />} />` | The card with its header: the title, its icon, and the "Live" badge on the right. |
| 20 | `<CardBody>` | The card's padded content area. |
| 21 | `<dl className="mb-12 grid grid-cols-2 gap-16">` | A two-column grid for the two numbers, 16px apart, with 12px below. `dl` is HTML for a list of labels and values. |
| 22–24 | `<SpeedReadout label="Download" … series="down" />` and Upload | The two numbers. Each is given its label, its rate and its direction, which sets the arrow and colour. The comment says each counts up to its new value once per sample. |
| 25 | `</dl>` | Closes the grid. |
| 27–28 | `<div className="-mx-(--card-body-padding) -mb-(--card-body-padding) bg-inset p-(--card-body-padding)">` | A sunken grey band for the chart. The negative margins stretch it to the card's edges; the padding brings the chart back in line with the title. |
| 29 | `<ThroughputChart download={…} upload={…} maxMbps={…} />` | The chart, given both lines and its ceiling. |
| 30–34 | closing tags | Close the band, the body, the card and the function. |

## `SpeedReadout.tsx`: one big number

| Line | Code | What it means |
| --- | --- | --- |
| 1 | `DirectionIcon, Readout, SpeedSeries, useCountUp` | The arrow icon, the library's number-with-unit display, the down/up type, and a helper that animates a number counting up. |
| 2 | `splitSpeedMbps` | Splits a rate into a value and a unit, like `186` and `Mbps`, or `1.24` and `Gbps`. |
| 4–8 | `const NOISE_FLOOR_MBPS = 0.1` | Below 0.1 Mbps is background chatter from the computer, so it's shown as zero. |
| 10–14 | `type SpeedReadoutProps` | What it's given: a label, a rate and a direction. |
| 16–19 | doc comment | The digits count up to each new value; screen readers hear the final value, not the in-between ones. |
| 20 | `export function SpeedReadout(…)` | Starts the readout. |
| 21 | `const settledMbps = mbps < NOISE_FLOOR_MBPS ? 0 : mbps` | Rounds tiny rates down to zero. |
| 22 | `const countingMbps = useCountUp(settledMbps)` | The number that animates towards the real value. |
| 23–24 | `shown` and `settled` | The animating number and the final one, each split into value and unit. |
| 26–34 | `<Readout … label=… icon=… value=… unit=… spokenValue=… />` | Draws the label, arrow, number and unit. `spokenValue` is what a screen reader hears: the final value. `className="min-w-0 flex-1"` lets it share the row evenly. |
| 35–36 | closing | End of the function. |

[← What opens below it](04-connection-details.md) · [The Capabilities card →](06-capabilities-card.md)
