# The network card: `ConnectionCard` and `ConnectionStrip`

Part 3 of [The Home page, line by line](README.md).

[← `HomeView.tsx`](02-home-view.md) · [What opens below it →](04-connection-details.md)

The network card is two files.
[`ConnectionCard.tsx`](../../../src/features/connection/ConnectionCard.tsx)
(45 lines) is the box and the open/close behaviour.
[`ConnectionStrip.tsx`](../../../src/features/connection/components/ConnectionStrip.tsx)
(140 lines) is the row you always see: icon, network name, meta line, share
button and arrow.

## `ConnectionCard.tsx`

| Line | Code | What it means |
| --- | --- | --- |
| 1 | `import { useId } from 'react'` | `useId` makes a unique id string, used to link the card to its title for screen readers. |
| 3–6 | imports from `features/connection` | The two parts (the strip and the details panel) and two helpers: one remembers whether the card is open, one fetches your public IP. |
| 7–8 | `NetworkInfo`, `isConnectedNetwork` | The shape of the network info, and the "are we connected?" check. |
| 9 | `import { Card, Collapsible, CollapsiblePanel } from '@/ui'` | Ready-made pieces from Rove's component library: a card box, and a wrapper that opens and closes a panel. |
| 11–13 | `type ConnectionCardProps = { info: NetworkInfo }` | Says what the card must be given: the network info, nothing else. |
| 15 | `/** Home's connection card … */` | A comment describing the card, shown when you hover its name in the editor. |
| 16 | `export function ConnectionCard({ info }: …)` | Starts the card and unpacks `info` from what it's given. |
| 17 | `const [isExpanded, toggleExpanded] = useDetailsExpanded()` | `isExpanded` says whether the details are open; `toggleExpanded` opens or closes them. The choice is remembered between visits. |
| 18–20 | `usePublicIp(isConnectedNetwork(info))` | Starts fetching your public IP, but only when connected. Done here, not inside the details, so it's ready the moment they open. `isLoading: isPublicIpLoading` renames a field as it's unpacked. |
| 21 | `const titleId = useId()` | Makes the unique id that ties the card to its title. |
| 23–30 | `if (!isConnectedNetwork(info)) { return … }` | Offline, there's nothing to expand, so the card is just the strip. `aria-labelledby` tells screen readers the card is named by its title. |
| 32–34 | `return ( <Card aria-labelledby={titleId}>` | Connected: the full card, still named by its title. |
| 35–37 | `<Collapsible isOpen={isExpanded} onOpenChange={toggleExpanded} hasFocusFrame …>` | The open/close wrapper. It's told whether it's open, and what to call when someone clicks. `hasFocusFrame` draws the keyboard focus ring around the whole card; `rounded-[inherit]` keeps that ring's corners matching the card's. |
| 38 | `<ConnectionStrip … isExpanded={isExpanded} />` | The always-visible row. It needs `isExpanded` to turn its arrow. |
| 39–41 | `<CollapsiblePanel> <ConnectionDetailsPanel … /> </CollapsiblePanel>` | The part that slides open: the details list, given the network info and the public IP. |
| 42–45 | closing tags | Close the wrapper, the card and the function. |

## `ConnectionStrip.tsx`

| Line | Code | What it means |
| --- | --- | --- |
| 1 | `import { cva, cx } …` | Two styling helpers. `cx` glues class names together; `cva` builds a recipe that picks classes from options (see the [glossary](08-glossary.md)). |
| 2 | `import type { ReactNode } …` | `ReactNode` means "anything React can draw": text, an element, or nothing. |
| 4–11 | imports from `features/connection` | The security badge, the share button, the signal bars, and three helpers that turn network info into text. |
| 12–13 | `NetworkInfo`, `isWifiNetwork` | The info's shape, and the "is this Wi‑Fi?" check. |
| 14–24 | imports from `@/ui` | Icons (arrow, Ethernet, offline, Wi‑Fi), the icon tile, the clickable toggle, and `InlineMeta`, which joins items with dots. |
| 25 | `import { formatBand } …` | Turns a frequency like 5745 MHz into "5 GHz". |
| 27 | `import styles from './ConnectionStrip.module.css'` | A small stylesheet for the few things utility classes can't say. |
| 29–35 | `const CONNECTION_ICONS = { wifi: …, ethernet: …, disconnected: … }` | A lookup table: which icon and colour for each kind of connection. Wi‑Fi and Ethernet both use the blue accent ("yours"); offline uses red. `as const satisfies …` checks every kind is covered without loosening the types. |
| 37–39 | `const ABOVE_TOGGLE = 'relative z-1 pointer-events-none'` | Classes for content that sits on top of the invisible click area but lets clicks pass through to it. |
| 41–56 | `const stripVariants = cva([…], { variants: { canExpand: … } })` | The row's look. Always: a flex row, 12px gaps, the card header's height and padding. Only when it can open: a hover highlight, also shown when the toggle has keyboard focus. |
| 58–60 | `const STRIP_SUBTITLE = cx('type-body text-secondary', …, 'truncate')` | The meta line's look: body text in the secondary grey, cut with "…" if it's too long. |
| 62–69 | `const chevronVariants = cva(…)` | The arrow's look: grey, and it rotates 180 degrees when open, animating over the app's normal duration. |
| 71–77 | `type ConnectionStripProps = {…}` | What the strip is given: the network info, the title's id, and optionally whether it's open. No `isExpanded` means it can't open at all. |
| 79–84 | `/** The card's always-visible row … */` | Describes the strip. |
| 85 | `export function ConnectionStrip(…)` | Starts the strip. |
| 86 | `const display = getConnectionDisplay(info)` | Works out the title (network name), subtitle and kind of connection. |
| 87 | `const { Icon, color } = CONNECTION_ICONS[display.variant]` | Looks up the icon and colour for this kind. |
| 88 | `const metaItems = stripMetaItems(info)` | Builds the meta line's pieces (see line 125). |
| 89 | `const canExpand = isExpanded !== undefined` | True if the card was told whether it's open, meaning there are details. |
| 91–92 | `<div className={stripVariants({ canExpand })}>` | The row itself, styled by the recipe. |
| 93 | `<IconTile size="lg" color={color} … icon={<Icon size={16} />} />` | The 36px square with the coloured icon. |
| 94 | `<div className={cx(ABOVE_TOGGLE, 'flex … flex-col gap-2 py-2')}>` | A column holding the title and the meta line, which takes the remaining width. |
| 95–97 | `<h2 id={titleId} className="type-title truncate text-primary">{display.title}</h2>` | The network name as a heading. Its id is the one the card points at for its name. |
| 98–100 | `{metaItems.length > 0 ? <InlineMeta … /> : display.subtitle}` | If there are meta items, show them joined by dots; otherwise show a plain subtitle (for example when offline). `a ? b : c` means "if a then b, else c". |
| 102–107 | `{isWifiNetwork(info) && ( … <ShareWifiButton /> … )}` | On Wi‑Fi only, the QR-code share button. It's raised above the click area so pressing it doesn't also open the card. |
| 108–111 | comment | Explains a trick: a button can't sit inside another button, so the open/close button is an invisible one stretched under the whole row. |
| 112–114 | `{canExpand && <CollapsibleTrigger className="absolute inset-0 …" aria-label="Connection details" />}` | That invisible full-row button. `absolute inset-0` stretches it over the row. Screen readers call it "Connection details". |
| 115 | `{canExpand && <ChevronDownIcon … aria-hidden />}` | The down arrow, rotated when open. `aria-hidden` hides it from screen readers since it's decoration. |
| 116–118 | closing tags | Close the row and the function. |
| 120–124 | `/** The meta line's items … */` | Describes the helper below: signal first on Wi‑Fi, then speed, band, security. |
| 125 | `function stripMetaItems(info): ReactNode[]` | A helper that returns a list of things to draw. |
| 126–127 | `const linkSpeed = formatLinkSpeed(info)` and `speedItem` | Gets text like "1.2 Gbps" and wraps it, if there is one. `a && b` gives b only when a exists. |
| 128 | `if (!isWifiNetwork(info)) return [speedItem].filter(Boolean)` | Not Wi‑Fi (Ethernet): the line is just the speed. `filter(Boolean)` drops empty entries. |
| 130–135 | `const signalItem = … <SignalMeter … /> {info.signalStrength}%` | If signal strength is known, the bars plus the percent, side by side with a 4px gap. |
| 136–138 | `const securityItem = … <SecurityBadge … isShort />` | If the security type is known, a short badge like a lock and "WPA3". |
| 139 | `return [signalItem, speedItem, formatBand(…), securityItem].filter(Boolean)` | The four pieces in order, with any missing ones dropped. |
| 140 | `}` | End of the helper. |

[← `HomeView.tsx`](02-home-view.md) · [What opens below it →](04-connection-details.md)
