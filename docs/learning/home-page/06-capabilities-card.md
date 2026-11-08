# The Capabilities card

Part 6 of [The Home page, line by line](README.md).

[← The Traffic card](05-traffic-card.md) · [The Usage and Devices cards →](07-usage-and-devices.md)

The Capabilities card shows a row of tiles, one per activity (browsing, HD
streaming, gaming…), each coloured by how well the last speed test says your
connection handles it. Before any test the tiles are grey. The file,
[`CapabilitiesCard.tsx`](../../../src/features/capabilities/CapabilitiesCard.tsx),
is 200 lines, split into small helper components.

## Imports and fixed styles (lines 1–48)

| Line | Code | What it means |
| --- | --- | --- |
| 1 | `import { cx } …` | Joins class names together. |
| 2 | `import { type JSX, useRef } from 'react'` | `JSX` for return types; `useRef` keeps a handle on a real page element (the row of tiles). |
| 4 | `UpdatedAgo` | Shows "Updated 5 min ago" and keeps it current as time passes. |
| 5 | `useNavigation` | Lets a click move to another tab. |
| 6–8 | `CapabilityIcon`, tile colours, level labels | The icon for each activity, the colour for each rating, and its word ("Excellent", "Fair"…). |
| 9–11 | `useCanRunSpeedTest`, `useSpeedTest`, `testStatusText` | Whether a test may run now, the shared speed-test memory, and the words a screen reader hears during a test. |
| 12–13 | `CapabilityDefinition`, `CapabilityRating`, `CAPABILITY_DEFINITIONS` | The shape of an activity before and after it's rated, and the full list of activities. |
| 14–30 | imports from `@/ui` | Library pieces: card parts, icons, buttons, tiles, the tooltip, the link, a screen-reader-only status line, and `useRovingFocus` (see line 59). |
| 32–33 | `const CAPABILITY_ROW = …` | The row's look: tiles spread evenly across, stretched to the card's edges. |
| 35 | `const CAPABILITY_CELL = 'flex flex-[0_0_auto]'` | Each tile's slot keeps its own size. |
| 37 | `const FOOTER_STATUS = …` | The footer's left text: grey, cut with "…" if long, with a small icon beside it. |
| 39–48 | `const FOOTER = cx(…)` | The grey band at the bottom. It sits 16px below the tiles, stretches to the card's edges and keeps the same height before and after a test. The comment says why it's hand-built and not the library's `CardFooter`. |

## The card (lines 50–79)

| Line | Code | What it means |
| --- | --- | --- |
| 50–53 | doc comment | A tile per activity, coloured by the last test, each opening its details. |
| 54 | `export function CapabilitiesCard()` | Starts the card. No inputs: it reads the speed-test memory itself. |
| 55 | `const capabilities = useSpeedTest((test) => test.capabilities)` | The ratings from the last test (an empty list before any test). |
| 56 | `const hasResults = capabilities.length > 0` | True once there's at least one rating. |
| 57–59 | `const rowRef = useRef(…)` and `useRovingFocus(rowRef, …)` | Makes the tiles one stop for the Tab key; the left and right arrow keys then move between tiles. |
| 61–63 | `<Card>` `<CardHeader title="Capabilities" … actions={<RunTestButton />} />` | The card and its header, with the run-test button on the right. |
| 64 | `<CardBody>` | The padded content area. |
| 65–67 | `<ul ref={rowRef} role="list" … aria-hidden={!hasResults \|\| undefined}>` | The row of tiles, as a list. Before any test, screen readers skip it: the grey tiles have nothing to say. |
| 68–72 | `hasResults ? capabilities.map(…) : CAPABILITY_DEFINITIONS.map(…)` | With results, a rated tile per rating; without, a grey tile per activity. `.map` turns each item into a tile, and `key` helps React track each one. |
| 73 | `</ul>` | Closes the row. |
| 74 | `<CapabilitiesFooter hasResults={hasResults} />` | The grey footer band (line 157). |
| 75 | `<ScreenReaderTestStatus />` | Invisible: announces a test's progress to screen readers (line 193). |
| 76–79 | closing tags | Close the body, card and function. |

## The run-test button (lines 81–100)

| Line | Code | What it means |
| --- | --- | --- |
| 81 | doc comment | The button starts a test right here; the Speed tab shows the same test, because they share one store. |
| 82–86 | `RunTestButton` reads `runTest`, `isTesting`, `hasResults`, `canRunTest` | What it needs: the start function, whether a test is running, whether there are results, and whether a test is allowed now. |
| 88–98 | `<IconButton label=… icon=… tooltip=… isLoading=… isDisabled=… onClick=… />` | A small icon button. Before any test it's a play icon labelled "Run speed test"; after, a refresh icon labelled "Run speed test again". While testing it spins and its tooltip says "Speed test running". It's disabled when a test can't run. `void runTest()` starts the test without waiting for it. |
| 99–100 | closing | End of the function. |

## One rated tile (lines 102–134)

| Line | Code | What it means |
| --- | --- | --- |
| 102 | doc comment | A tested activity: its tile, coloured by its rating, opens its details. |
| 103 | `function RatedCapability({ capability })` | One tile for one rated activity. |
| 104 | `const { navigate } = useNavigation()` | The function that changes tabs. |
| 105–106 | `const isTesting = …` | Whether a test is running, from either this card or the Speed tab. |
| 107 | `const levelLabel = CAPABILITY_LEVEL_LABELS[capability.level]` | The rating's word, like "Good". |
| 109–111 | `const openDetails = () => { navigate({ tab: 'speed', speedSub: … }) }` | What a click does: open the Speed tab's details page, scrolled to this activity. |
| 113–114 | `<li className={CAPABILITY_CELL}>` | The tile's slot in the list. |
| 115–122 | `<Tooltip content=… side="top" sideOffset={2} isDisabled={isTesting} shouldDescribe={false}>` | A tooltip above the tile showing "4K Streaming • Good". It's off during a test. `shouldDescribe={false}` stops screen readers reading it twice, since the button's own label already says it. |
| 123–130 | `<IconTileButton color=… label=… onClick=… isDisabled=… icon=… />` | The clickable tile. Its colour is the rating's, or grey during a test. Screen readers hear its label, such as "4K Streaming: Good". It can't be clicked during a test, because the rating is about to change. |
| 131–134 | closing tags | Close the tooltip, slot and function. |

## One grey tile (lines 136–150)

| Line | Code | What it means |
| --- | --- | --- |
| 136–137 | `function UnratedCapability({ capability })` | One tile before any test. |
| 139–140 | `<li …>` `<Tooltip content={capability.label} side="top">` | Its slot, with a tooltip naming the activity. |
| 141–146 | `<IconTile color="neutral" className="opacity-(--opacity-disabled)" … />` | A grey tile, faded like a disabled control. It isn't clickable: there's nothing to open yet. |
| 147–150 | closing tags | End of the function. |

## The footer (lines 152–190)

| Line | Code | What it means |
| --- | --- | --- |
| 152–156 | doc comment | Status on the left, a link to the Speed page on the right. |
| 157–164 | `function CapabilitiesFooter(…)` | The band, holding the status and the link. |
| 166–168 | `function FooterStatus(…)` reads `isTesting`, `completedAt` | Whether a test is running, and when the last one finished. |
| 170 | `if (isTesting) return <span …>Testing…</span>` | During a test: "Testing…". |
| 171 | `if (!hasResults) return <span …>Not tested yet</span>` | Before any test: "Not tested yet". |
| 172 | `if (completedAt == null) return null` | No finish time known: show nothing. |
| 173–178 | `<HistoryIcon …/> <UpdatedAgo timestamp={completedAt} />` | Otherwise a clock icon and "Updated 5 min ago". |
| 179 | `}` | End of the status. |
| 181–190 | `function OpenSpeedLink()` | The "Speed test ›" link that opens the Speed tab. Its small negative margin keeps the footer's height steady. |

## The screen-reader status (lines 192–200)

| Line | Code | What it means |
| --- | --- | --- |
| 192 | doc comment | Screen readers hear a test's progress from here, as on the Speed page, and an error if one happens, since Home shows none on screen. |
| 193–197 | reads `isTesting`, `progress`, `internetSpeed`, `error` | Everything needed to describe the test's state. |
| 199 | `<ScreenReaderStatus>{error ?? testStatusText(…)}</ScreenReaderStatus>` | Says the error if there is one; otherwise words like "Testing download" or "Speed test complete". `??` means "use the left side, or the right if the left is empty". |
| 200 | `}` | End of the file. |

[← The Traffic card](05-traffic-card.md) · [The Usage and Devices cards →](07-usage-and-devices.md)
