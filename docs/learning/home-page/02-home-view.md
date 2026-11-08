# `HomeView.tsx`: the page itself

Part 2 of [The Home page, line by line](README.md).

[← The big picture](01-overview.md) · [The network card →](03-connection-card.md)

[`src/features/home/HomeView.tsx`](../../../src/features/home/HomeView.tsx) is
40 lines. It decides which cards appear and in what order; it draws nothing
itself.

| Line | Code | What it means |
| --- | --- | --- |
| 1 | `import type { JSX } from 'react'` | Borrows the name `JSX` from React, only so the code can say what the function returns. `type` means it vanishes when the app is built. |
| 3 | `import { useNetwork } …` | Brings in `useNetwork`, which hands over what Rove knows about the current network (Wi‑Fi or Ethernet, name, speed). |
| 4–8 | `import { CapabilitiesCard } …` and so on | Brings in the five cards the page is built from: Capabilities, Connection, Devices, Usage and Traffic. Each lives in its own file. |
| 9 | `import { useSpeedTest } …` | Brings in the speed test's shared memory, so the page can ask whether there are any test results. |
| 10 | `import { isConnectedNetwork } …` | A small yes/no helper: is this network actually connected? |
| 12 | `export function HomeView(): JSX.Element \| null {` | Starts the page. `export` lets other files use it. It returns either some screen content or `null`, which means "show nothing". |
| 13 | `const { info } = useNetwork()` | Reads the network info and keeps it in `info`. |
| 14–15 | `const hasCapabilities = useSpeedTest(…)` | Asks the speed-test memory: are there any capability ratings? `hasCapabilities` is true or false. The comment says why: old results keep that card visible even when you're offline. |
| 17–18 | `if (!info) return null` | If the network info hasn't arrived yet, draw nothing. The app's frame shows its own loading screen meanwhile. |
| 20 | `const isConnected = isConnectedNetwork(info)` | Works out once whether you're connected, and keeps the answer. |
| 22–23 | `return ( <div className="page">` | Starts the screen content. The `page` class stacks the cards in a column with even gaps, and fades them in one after another. |
| 24–26 | `<h1 className="sr-only">Home</h1>` | A page title only screen readers hear (`sr-only` hides it visually). Every screen needs one, and keyboard focus lands on it when you switch tabs. |
| 27 | `<ConnectionCard info={info} />` | The network card at the top, always shown. It's handed `info` so it knows what to display. |
| 29 | `{isConnected && <TrafficCard />}` | The live traffic chart, shown only when connected. `A && B` means "if A is true, show B". |
| 30 | `{(isConnected \|\| hasCapabilities) && <CapabilitiesCard />}` | The capabilities row, shown if you're connected **or** there are earlier results. `\|\|` means "or". |
| 32–34 | `<div className="grid grid-cols-[3fr_2fr] gap-10">` | A two-column row. `3fr_2fr` gives the left column three parts of the width and the right two, because Usage shows two numbers and Devices one. `gap-10` puts 10px between them. |
| 35–36 | `<UsageCard />` `<DevicesCard />` | The two small summary cards in that row. |
| 37–40 | closing tags and braces | Close the row, the page and the function. |

[← The big picture](01-overview.md) · [The network card →](03-connection-card.md)
