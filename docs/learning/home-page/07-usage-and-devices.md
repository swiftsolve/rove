# The Usage and Devices cards

Part 7 of [The Home page, line by line](README.md).

[← The Capabilities card](06-capabilities-card.md) · [Glossary →](08-glossary.md)

The two small cards at the bottom share one layout,
[`StatCard.tsx`](../../../src/features/home/components/StatCard.tsx) (62 lines):
a title over a single readout, and the whole card is a link to its tab.
[`UsageCard.tsx`](../../../src/features/home/components/UsageCard.tsx) (40
lines) fills it with today's data use;
[`DevicesCard.tsx`](../../../src/features/home/components/DevicesCard.tsx) (94
lines) with how many devices are online.

## `StatCard.tsx`: the shared layout

| Line | Code | What it means |
| --- | --- | --- |
| 1–2 | `cx`, `ReactNode` | The class joiner, and "anything React can draw". |
| 4 | `Card, CardBody, CardHeader, DirectionIcon, NoValue, Readout, StatusDot` | Library pieces: card parts, the down/up arrow, the "no value" dash, the number display, and the small coloured dot. |
| 6–11 | `const READOUT_AREA = cx(…)` | The readout's space is always one big figure tall, whatever it holds (a number, a spinner, a dash or a button), so the card never changes size. |
| 13–24 | `type StatCardProps` | What the card is given: an icon, a title, the link's spoken name, what to do when clicked, whether it's loading, and the readout itself (`children`). |
| 26 | doc comment | One of Home's small summary cards: a title over a readout, opening its tab. |
| 27 | `export function StatCard(…)` | Starts the layout. |
| 29 | `<Card onOpen={onOpen} linkLabel={linkLabel} aria-busy={isLoading \|\| undefined}>` | A card that acts as one big link. `linkLabel` is what a screen reader says for it; `aria-busy` tells screen readers it's loading. |
| 30 | `<CardHeader title={title} icon={icon} />` | The title and its icon. |
| 31–33 | `<CardBody> <div className={READOUT_AREA}>{children}</div> </CardBody>` | The readout, in its fixed-height space. |
| 34–36 | closing | End of the function. |
| 38–44 | `type StatReadoutProps` | What a readout takes: its marker (a down or up arrow, or the green "online" dot), the value and the unit. |
| 46 | doc comment | A compact value behind its marker. |
| 47 | `export function StatReadout(…)` | Starts the readout. |
| 48–51 | `const icon = marker === 'online' ? <StatusDot … /> : <DirectionIcon … />` | Picks the marker: a green dot for "online", otherwise the arrow. The dot gets a little extra space after it. |
| 52 | `return <Readout size="compact" … />` | Draws the marker, value and unit, small. |
| 53 | `}` | End of the function. |
| 55–62 | `export function EmptyStatReadout()` | What shows when there's no number: a dash at the number's size, hidden from screen readers. |

## `UsageCard.tsx`: today's data

| Line | Code | What it means |
| --- | --- | --- |
| 1–6 | imports | Tab navigation, the shared layout, the usage data hook, a helper that picks out today, the calendar icon, and a helper that splits bytes into a value and a unit ("4.90" "GB"). |
| 8 | doc comment | Today's download and upload totals; opens the Usage tab. |
| 9 | `export function UsageCard()` | Starts the card. |
| 10 | `const { usage, isLoading, error } = useDataUsage()` | Asks for the data use, and whether it's still loading or failed. Usage and the Usage tab share this one answer. |
| 11 | `const { navigate } = useNavigation()` | The function that changes tabs. |
| 12 | `const today = todaysUsage(usage)` | Picks today's totals out of the data, if any. |
| 13–15 | `const hasTotals = today != null \|\| (!isLoading && error == null)` | True if there's a day for today, or the load finished cleanly with nothing yet (which genuinely means zero use). Still loading, or failed, is not zero, so there are no totals to show. |
| 16–17 | `downloaded`, `uploaded` | Today's received and sent bytes, split into value and unit; zero if none. |
| 18–20 | `const summary = hasTotals ? '… down, … up' : 'unavailable'` | The same numbers in words, for screen readers. |
| 22–29 | `<StatCard icon=… title="Usage" linkLabel=… onOpen=… isLoading=… >` | The card: calendar icon, title "Usage", a spoken name like "Usage: 4.90 GB down, 600 MB up. Open Usage.", opening the Usage tab, and a loading state while there's nothing yet. |
| 30–34 | `<div className="grid w-full grid-cols-2 gap-8" aria-hidden>` with two `StatReadout`s | With totals: download and upload side by side. They're hidden from screen readers because the card's spoken name already says them. |
| 35–37 | `: ( <EmptyStatReadout /> )` | Without totals: the dash. |
| 38–40 | closing | End of the card and function. |

## `DevicesCard.tsx`: devices online

| Line | Code | What it means |
| --- | --- | --- |
| 1 | `import type { MouseEvent } …` | The type of a mouse click, used by the Discover button. |
| 3–7 | imports | Tab navigation, the device scan hook, the shared layout, a button, a spinner, icons, a helper that moves focus to the card's link, and `formatCount` ("1 device", "3 devices"). |
| 9 | doc comment | How many devices are online; opens the Devices tab. |
| 10 | `export function DevicesCard()` | Starts the card. |
| 11 | `const { canHomeAutoScan, lastScan, isScanning, rescan } = useDevices()` | From the device scan: whether Home may scan by itself, the last scan's results, whether a scan is running, and a function to start one. The Devices tab shares this same scan. |
| 12 | `const { navigate } = useNavigation()` | The function that changes tabs. |
| 13 | `const onlineCount = lastScan ? … .filter(device => device.isReachable).length : null` | The number of devices that answered, or `null` if there's been no scan. |
| 14–15 | `const canDiscover = !canHomeAutoScan && !lastScan && !isScanning` | On macOS, Home doesn't scan by itself, because scanning asks for a permission. So until the first scan, the card offers a Discover button. |
| 17–31 | `<StatCard … linkLabel={devicesLinkLabel(…)} onOpen=… isLoading={isScanning}>` with `<DevicesCardBody … />` | The card: icon, title "Devices", a spoken name, opening the Devices tab, loading while scanning. Its body is chosen below. `onDiscover` is set only when the Discover button should show. |
| 32 | `}` | End of the card. |
| 34–38 | `function devicesLinkLabel(…)` | The spoken name: "Scanning for devices. Open Devices.", "Open Devices.", or "16 devices online. Open Devices." |
| 40–46 | `type DevicesCardBodyProps` | What the body is given: the count, whether a scan is running, and the optional Discover action. |
| 48 | `function DevicesCardBody(…)` | Picks what fills the card. |
| 49 | `if (isScanning) return <ScanSpinner />` | Scanning: a spinner. |
| 50–56 | `if (onlineCount !== null) { return … <StatReadout marker="online" … unit="online" /> … }` | A count: the green dot, the number and "online". Hidden from screen readers, because the card's spoken name says it. |
| 57 | `if (onDiscover) return <DiscoverButton … />` | No scan yet on macOS: the Discover button. |
| 58 | `return <EmptyStatReadout />` | Otherwise: the dash. |
| 59 | `}` | End of the body. |
| 61–72 | `function ScanSpinner()` | A small grey spinner, centred in the readout's space, so the card keeps its size when the number replaces it. |
| 74–94 | `function DiscoverButton(…)` | The "Discover" button with a search icon. A click first moves keyboard focus to the card's link (the spinner is about to replace the button, and focus would otherwise be lost), then starts the scan. It's raised above the card's link so its click only scans, and `-my-4` lets it overlap the padding instead of making the card taller. |

[← The Capabilities card](06-capabilities-card.md) · [Glossary →](08-glossary.md)
