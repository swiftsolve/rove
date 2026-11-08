# What opens below it: `ConnectionDetailsPanel` and `SignalMeter`

Part 4 of [The Home page, line by line](README.md).

[← The network card](03-connection-card.md) · [The Traffic card →](05-traffic-card.md)

[`ConnectionDetailsPanel.tsx`](../../../src/features/connection/components/ConnectionDetailsPanel.tsx)
(109 lines) is the list that slides open when you click the network card.
[`SignalMeter.tsx`](../../../src/features/connection/components/SignalMeter.tsx)
(45 lines) draws the four signal bars used in the strip and in that list.

## `ConnectionDetailsPanel.tsx`

| Line | Code | What it means |
| --- | --- | --- |
| 1 | `import type { ReactNode } …` | "Anything React can draw", used as a return type below. |
| 3 | `import { SpeakableText } …` | Shows text as written but lets a screen reader say it more naturally, for example without brackets. |
| 4–7 | imports from `features/connection` | The security badge, the signal bars, the link-speed formatter, and `signalWord`, which turns a percent into a word like "Excellent". |
| 8–9 | network types and checks | The shapes of Wi‑Fi, Ethernet and general network info, and the "is it Wi‑Fi / Ethernet?" checks. |
| 10 | `import { DataList, DataListStack, DataRow, InlineMeta, NoValue } …` | Library pieces: a list of label/value rows, a stack of such lists with dividers between, one row, dot-joined items, and the dash shown when a value is missing. |
| 11 | formatters from `@/utils/format` | Turn raw values into readable text: band, channel, "Wi‑Fi 6", "Full duplex", and so on. |
| 13–17 | `type ConnectionDetailsPanelProps` | What the panel is given: network info, the public IP (text or nothing), and whether that IP is still loading. |
| 19–22 | doc comment | Says the panel groups rows by topic: the link first, then addresses from your device outward. |
| 23 | `export function ConnectionDetailsPanel(…)` | Starts the panel. |
| 25–28 | `<div className="bg-inset py-12">` | A sunken grey background with 12px above and below. The comment explains it keeps that padding while the open animation runs. |
| 29 | `<DataListStack>` | Stacks the groups with a divider line between each. |
| 30 | `{isWifiNetwork(info) && <WifiLinkRows … />}` | On Wi‑Fi, the Wi‑Fi rows. |
| 31 | `{isEthernetNetwork(info) && <EthernetLinkRows … />}` | On Ethernet, the Ethernet rows instead. |
| 32 | `<AddressRows … />` | Always, the address rows. |
| 33–36 | closing tags | Close the stack, the background and the function. |
| 38–39 | `function WifiLinkRows(…)`, `const linkSpeed = …` | The Wi‑Fi group. First works out the link speed text. |
| 41 | `<DataList density="compact">` | A list with tighter row spacing. |
| 42–43 | `<DataRow label="Network name" value={info.ssid \|\| null} />` | The network name. If the computer hides it (it can without location permission), `null` shows a dash. |
| 44 | `<DataRow label="Signal" align="center">` | The Signal row, with its contents centred vertically. |
| 45–47 | `<div className="flex items-baseline justify-end gap-6">` | Lines the bars and words up on the text's baseline, pushed to the right, 6px apart. The comment explains why a block (not inline) layout is used. |
| 48–49 | `<SignalMeter … shouldAnnounce={false} />` | The bars, silent for screen readers because the words next to them already say the rating. |
| 50 | `{formatSignalDetail(info)}` | The words, such as "Excellent • 84% (−47 dBm)" (see line 96). |
| 51–52 | closing tags | Close the Signal row. |
| 53 | `{linkSpeed && <DataRow label="Link speed" … />}` | The link speed row, only if it's known. |
| 54 | `<DataRow label="Band" … />` | "5 GHz" and so on. |
| 55–56 | Channel and Standard rows | Channel number with its frequency, and the Wi‑Fi generation, both read naturally by screen readers. |
| 57–65 | `{info.security != null ? (…SecurityBadge…) : (…NoValue…)}` | If the security type is known, a badge; if not, a dash. |
| 66–68 | closing tags | Close the list and the function. |
| 70–81 | `function EthernetLinkRows(…)` | The Ethernet group: the adapter's name, the link speed, and duplex (whether it sends and receives at once). `?? <NoValue />` means "if this is empty, show a dash". The comment notes the interface name and MAC address live on the Interfaces screen. |
| 83 | `type AddressRowsProps = Pick<…>` | Reuses three fields from the panel's own props instead of writing them again. |
| 85–93 | `function AddressRows(…)` | The address group: your IP address, the gateway (router) address, and your public IP. While the public IP loads it says "Checking…"; if none comes back, a dash. |
| 95–104 | `function formatSignalDetail(info)` | Builds the Signal words. If the percent is known: the word, then the percent, plus dBm when known. If only dBm is known: just that. Otherwise a dash. `Number.isFinite` guards against broken numbers. |
| 106–109 | `function speakable(text)` | If there's text, wrap it so screen readers say it cleanly; if not, return `null` so the row shows a dash. |

## `SignalMeter.tsx`

| Line | Code | What it means |
| --- | --- | --- |
| 1 | `import { cva, cx } …` | The styling helpers (see the [glossary](08-glossary.md)). |
| 3 | `signalBarCount, signalLevel, signalWord` | Three helpers that turn a 0–100 strength into a bar count (0–4), a level (good, fair, poor) and a word. |
| 4 | `import { BarMeter } …` | The library component that draws four rising bars. |
| 6–10 | `const signalMeterVariants = cva(…)` | The colour recipe: green for good, amber for fair, red for poor. The bars take their colour from the text colour. |
| 12–18 | `type SignalMeterProps` | What it's given: the strength, whether screen readers should announce it, and optional extra classes. |
| 20–23 | doc comment | Four bars coloured by quality, as tall as the text's capital letters. |
| 24 | `export function SignalMeter(…)` | Starts the meter. `shouldAnnounce = true` means announce unless told otherwise. |
| 25 | `const meterClassName = cx(…)` | Picks the colour for this strength and adds any extra classes. |
| 26–32 | `if (!shouldAnnounce) { return <span …><BarMeter … /></span> }` | Silent version: just the bars. |
| 33–41 | `<span … role="meter" aria-label=… aria-valuenow=… …>` | Announced version: screen readers hear "Wi‑Fi signal: Excellent" and that it's a meter at, say, 84 out of 100. |
| 42–45 | `<BarMeter value={signalBarCount(strength)} />` and closing tags | The bars with the right number lit, then the end of the function. |

[← The network card](03-connection-card.md) · [The Traffic card →](05-traffic-card.md)
