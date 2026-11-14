# ARIA in Rove

Rove uses 15 ARIA attributes and 10 roles in `src/`, mostly to name icon-only
controls, hide decorative marks and announce status. Base UI
(`@base-ui/react`) adds the rest itself: `aria-expanded`, `aria-controls` and
`aria-haspopup` on collapsibles and menus, plus dialog and focus wiring.

Counts are every occurrence in `.ts`/`.tsx` under `src/`, tests and stories
included, as of November 2026.

| Attribute or role | Uses | Main purpose |
| --- | --- | --- |
| `aria-hidden` | 69 | Hide icons, dots, charts drawn twice |
| `aria-label` | 46 | Name icon buttons, lists, charts |
| `aria-describedby` | 20 | Tooltips, settings descriptions |
| `aria-labelledby` | 12 | Name a card or list by its heading |
| `aria-expanded` | 12 | Collapsible state (from Base UI) |
| `aria-disabled` | 12 | Disabled but still focusable |
| `aria-current` | 10 | Current page in the nav rail |
| `aria-busy` | 10 | Loading buttons and lists |
| `aria-haspopup` | 4 | Button that opens a dialog or menu |
| `aria-invalid` | 3 | TextField error (from Base UI) |
| `aria-valuenow` / `min` / `max` | 2 each | Signal meter, speed test progress |
| `aria-live` | 2 | Share Wi‑Fi dialog body |
| `aria-controls` | 1 | Collapsible trigger to panel (from Base UI) |
| `role="status"` | 16 | Polite announcements |
| `role="list"` | 16 | Keep list semantics on styled `<ul>` |
| `role="img"` | 9 | Charts and icons that carry meaning |
| `role="alert"` | 8 | Errors announced at once |
| `role="link"` | 4 | Buttons that navigate |
| `role="meter"` | 3 | Wi‑Fi signal strength |
| `role="switch"`, `progressbar`, `group` | 1 each | Toggle, speed test, week chart |

## Labelling: aria-label, aria-labelledby, aria-describedby

Library components take a required `label` prop and turn it into `aria-label`,
so an icon-only control can't ship without a name. Visible text wins when it
exists: `aria-labelledby` points at it.

| Attribute | Where | What it names |
| --- | --- | --- |
| `aria-label` | `IconButton`, `Toggle`, `NavItem`, `NavRail`, `MenuTrigger`, `TitleBar`, `IconTile`, `StretchedLink`, `SegmentedControl`, `CardList` | The control or group, from its `label` prop |
| `aria-label` | `PageHeader.tsx:85` | The back button: "Back" |
| `aria-label` | `SpeedView.tsx:74` | "Stop test" button |
| `aria-label` | `DevicesView.tsx:75`, `InterfacesView.tsx:35`, `AppGroup.tsx:84` | Lists: "Devices", "Network interfaces", "Hosts for …" |
| `aria-label` | `WeekChart.tsx:187`, `Sparkline.tsx:173`, `ThroughputChart.tsx:90`, `SplitBar.tsx:38` | A chart's data in words |
| `aria-label` | `ConnectionStrip.tsx:113` | Full-size trigger: "Connection details" |
| `aria-labelledby` | `Card.tsx:69`, `ConnectionCard.tsx:26` | A `<section>` card by its title |
| `aria-labelledby` | `Card.tsx:75` | The card's stretched link by its title |
| `aria-labelledby` | `TimelineDay.tsx:20` | A day's list by its date heading |
| `aria-labelledby` | `SettingsView.tsx:69` | A setting by its label text |
| `aria-describedby` | `Tooltip.tsx:74`, `:82` | The trigger by the tooltip text, joined to any it already has |
| `aria-describedby` | `SettingsView.tsx:70`, `:167`, `:176`, `:206` | A setting's control by its description |

A chart reads as one sentence:

```tsx
<div
  role="img"
  aria-label={`${point.label}: ${formatBytes(point.down)} down, ${formatBytes(point.up)} up`}
/>
```

A card is named by its heading, not a repeat of it:

```tsx
<Element aria-labelledby={Element === 'section' ? titleId : undefined}>
```

Tooltip skips `aria-describedby` when its text equals the trigger's
`aria-label`, so the name is not read twice (`Tooltip.tsx:66`).

## State: disabled, busy, current, expanded, invalid

Rove never uses the native `disabled` attribute on controls. `aria-disabled`
keeps a disabled control focusable, so a keyboard or screen reader user still
finds it and hears why. `aria-busy` marks work in progress. Both are set as
`true` or left out, never `false`.

| Attribute | Where | When it is set |
| --- | --- | --- |
| `aria-disabled` | `pressable.ts:36` (Button, IconButton, ListRow, IconTile), `Toggle.tsx:41` | `isDisabled` prop |
| `aria-busy` | `pressable.ts:37` | `isLoading` prop on a button |
| `aria-busy` | `DevicesView.tsx:75`, `InterfacesView.tsx:35`, `StatCard.tsx:29`, `WifiShareDialog.tsx:42` | A list, card or dialog body is loading |
| `aria-current="page"` | `NavRail.tsx:60` | The nav item for the open screen |
| `aria-expanded` | `Collapsible` trigger, `AppGroup`, `ConnectionStrip` (set by Base UI) | Panel open or closed |
| `aria-invalid` | `TextField` input (set by Base UI) | `isInvalid` prop |

The shared helper behind every pressable:

```ts
// packages/ui/src/utils/pressable.ts
'aria-disabled': isDisabled || undefined,
'aria-busy': isLoading || undefined,
```

The nav rail marks the current page, and code finds it by that attribute too
(`NavRail.tsx:105`, `useRovingFocus`):

```tsx
<button aria-current={isActive ? 'page' : undefined} aria-label={label}>
```

Styles read state from attributes as well: `AppGroup.tsx:28` uses Tailwind's
`aria-expanded:pb-8`.

## Hiding, values, live regions and popups

`aria-hidden` is the most used attribute: 69 uses across 47 files. It hides
anything a screen reader would otherwise read as noise or read twice.

| Attribute | Where | Why |
| --- | --- | --- |
| `aria-hidden` | `Icons.tsx`, `CustomIcon.tsx`, `BrandIcon.tsx`, `DirectionIcon.tsx` | Every library icon is decorative; the control around it carries the name |
| `aria-hidden` | `StatusDot`, `DotSeparator`, `TimelineNode`, `SegmentedControl` thumb, `PageHeader` divider | Shapes with no meaning of their own |
| `aria-hidden` | `SpokenText.tsx:18`, `NoValue.tsx:16` | Visible text swapped for plain spoken words |
| `aria-hidden` | `BarMeter.tsx:70`, `WeekChart`, `ThroughputChart`, `Sparkline` | Drawing whose values are said elsewhere |
| `aria-valuenow` / `min` / `max` | `SignalMeter.tsx:38`, `SpeedTestCard.tsx:97` | Value of a `meter` or `progressbar`, 0 to 100 |
| `aria-live="polite"` | `WifiShareDialog.tsx:42` | Dialog body that changes while open |
| `aria-haspopup="dialog"` | `ServicesView.tsx:48` | "Add service" opens a dialog |
| `aria-haspopup="menu"` | `MenuTrigger` (set by Base UI) | Opens a menu |
| `aria-controls` | `Collapsible` trigger (set by Base UI) | Points at the panel it opens |

`SpokenText` shows a symbol but speaks words:

```tsx
<span aria-hidden>{children}</span>
<span className="sr-only">{spoken}</span>
// <SpokenText spoken="at least 25 Mbps">≥ 25 Mbps</SpokenText>
```

The signal meter exposes its value and says it in words:

```tsx
<span
  role="meter"
  aria-label={`Wi‑Fi signal: ${signalWord(strength)}`}
  aria-valuenow={strength}
  aria-valuemin={0}
  aria-valuemax={100}
/>
```

## Roles

Roles fill gaps native HTML leaves: announcements, lists that lose their
semantics when styled, and drawings that carry data.

| Role | Where | Why |
| --- | --- | --- |
| `status` | `ScreenReaderStatus.tsx:12`, `LoadingState.tsx:17`, `TitleBar.tsx:72`, `TextField.tsx:93`, `NetworkInfoStates.tsx:63`, `DevicesView.tsx:39`, `ServiceTally.tsx:35`, `RestartAsAdminAction.tsx:35` | Polite announcement of loading, counts and feedback |
| `alert` | `Banner.tsx:58`, `AppErrorBoundary.tsx:51`, `UpdateDialog.tsx:58`, `NetworkInfoStates.tsx:73`, `SpeedTestCard.tsx:218`, `AddServiceDialog.tsx:68`, `WifiShareDialog.tsx:72` | Errors, announced at once |
| `list` | `CardList` (`Card.tsx:104`), `TimelineDay`, `DevicesView`, `InterfacesView`, `SpeedHistoryView`, `AppGroup`, `CapabilityList`, `CapabilityDetailsView` | Safari drops list semantics from `<ul>` with `list-style: none` |
| `img` | `WeekChart.tsx:185`, `ThroughputChart.tsx:90`, `Sparkline.tsx:134`, `:172`, `SplitBar.tsx:38`, `HostRow.tsx:35`, `CapabilityList.tsx:96` | A drawing or icon with meaning, named by `aria-label` |
| `link` | `StretchedLink.tsx:31`, `Link.tsx:86` | A `<button>` that navigates inside the app |
| `meter` | `SignalMeter.tsx:36` | Wi‑Fi signal strength |
| `progressbar` | `SpeedTestCard.tsx:95` | Speed test progress |
| `switch` | `Toggle` (set by Base UI) | On/off setting |
| `group` | `WeekChart.tsx:125` | Wraps the 7 day stops |

A styled list keeps its role on purpose; lint allows it
(`eslint.config.js:185`):

```tsx
<ul role="list" aria-label="Devices" aria-busy={isScanning}>
```

An error appears and is read straight away:

```tsx
<div className={bannerVariants({ variant })} role="alert">
```

## Rules and checks

Four checks guard ARIA, and [the UI library guide](../packages/ui/README.md) (Every
component) sets the patterns.

- **Pass `aria-*` through.** A one-element component takes its element's
  props, so any can take an `aria-*` or be a Tooltip trigger.
- **Announce from a region that stays mounted.** Change only its text; a
  region that mounts already holding text often isn't read. TextField
  feedback, PageHeader `status` and `ScreenReaderStatus` work this way.
- **Let Base UI wire ARIA.** Focus traps, roving focus, dismissal,
  `aria-expanded`, `aria-controls`; features reach it only through `@swiftsolve/rove-ui`.
- **Say plain words.** No symbols, brackets or slashes read aloud; use
  `SpokenText`.
- **Booleans:** `aria-*` props are exempt from the `is`/`has` naming rule
  (`eslint.config.js:70`).

| Check | Runs |
| --- | --- |
| `eslint-plugin-jsx-a11y-x` | `npm run check` (lint) |
| `@storybook/addon-a11y` (axe on every story) | `npm run check` (Vitest storybook project) |
| DOM tests asserting `aria-*` values | `npm run check` |
| `npm run a11y` (axe on each screen, both themes) | By hand; no hook or CI runs it |
