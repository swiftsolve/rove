# Where code goes, and naming

Part 6 of [Learning Rove's UI](README.md).

[← How a library component is built](05-library-components.md) · [Accessibility in practice →](07-accessibility.md)

The rules: [src/README.md: Where code goes](../../../src/README.md#where-code-goes)
and [Names and copy](../../../src/README.md#names-and-copy). The full map of
the repo: [How Rove Is Put Together: Where everything lives](../../architecture.md#where-everything-lives).

## The same folders everywhere

`src/app` and every feature in `src/features` use one layout. Devices:

```
features/devices/
├── DevicesView.tsx     the page and its layout
├── components/         DeviceRow, OnlineIndicator, ScanStatus
├── hooks/              useDevices
└── utils/              device-display.ts and its test, status-slot.ts, …
```

A `context/` folder joins them when there are providers:
[src/app/context](../../../src/app/context) holds the app's.

Why bother: you know where to look before opening anything. A feature's name
tells you where its data hook is. The split also follows what's easy to test.
`utils/` is plain functions, so
[device-display.test.ts](../../../src/features/devices/utils/device-display.test.ts)
checks sorting and naming in Node, with no DOM and no backend. A view file
holds the page, not the logic behind its copy.

Code more than one feature uses sits in `src/hooks` (`useBackendQuery`) and
`src/utils` (formatting, the platform). `src/types` is only the backend
contract, mirrored in Rust; a type only the UI uses lives next to its code, like
[features/speed/types.ts](../../../src/features/speed/types.ts). The library
is flat: a kebab-case folder per component (`button/`, `text-field/`), its
stories and tests beside it.

## File names say what a file is

| It's a | Case | Example |
| --- | --- | --- |
| Component | PascalCase | `ThemeProvider.tsx` |
| Hook | camelCase, starting with `use` | `useTheme.ts` |
| Anything else: context, util, type, stylesheet, folder | kebab-case | `theme-context.ts`, `base.css`, `live-throughput/` |

So in `src/app/context` you tell `ThemeProvider.tsx` (the component that
provides the theme) from `theme-context.ts` (the context object) by name alone.
Each hook has its own file, so the list of files in `hooks/` is the list of
hooks.

## Booleans read as questions

From [DevicesView.tsx](../../../src/features/devices/DevicesView.tsx):

```ts
  const isOnlySelf = !isScanning && lastScan != null && devices.every((device) => device.isSelf)
  const shouldShowLocalNetworkHint = IS_MAC && isOnlySelf
```

Why bother: `scanning` could be a boolean, a scan, or a function that scans.
`isScanning` can only be yes or no, and `if (shouldShowLocalNetworkHint)` reads
as a sentence. The prefix says which kind of yes, too: `is` a state, `has`
something held, `can` an ability, `should` a decision. ESLint holds props,
state, parameters, fields and module constants (`IS_MAC`) to it. A name the
DOM or a library chose keeps its name where it's set.

## `type`, not `interface`

TypeScript has two ways to name an object shape, and for a plain shape they do
the same job. Rove uses `type`, because of what happens later: a shape often
grows into a union or an intersection, which only `type` can say. PageHeader's
props are a shape joined to one of two branches
([PageHeader.tsx](../../../src/ui/page-header/PageHeader.tsx)):

```ts
  // Exactly one of `icon` or `onBack`: each branch types the other as `never`,
  // so passing both is an error.
  (
    | {
        /** The page's nav icon, in a chip: a top-level page. */
        icon: ReactNode
        onBack?: never
      }
    | {
        /** A back button in the chip's place: a page layered over a tab. */
        onBack: () => void
        icon?: never
      }
  )
```

Had it started as an `interface`, adding that would have meant rewriting it.
Starting with `type` means no rewrite, and one keyword to read everywhere.

## Comments say why

The code already says what it does. A comment earns its place by saying what
the code can't: a reason, a limit, a trap. From
[useDevices.ts](../../../src/features/devices/hooks/useDevices.ts):

```ts
  // No poll: a LAN scan (ARP/SSDP/ping sweeps) is too heavy to repeat in the
  // background. A network switch rescans through the key. Raw `network-changed`
  // nudges don't: macOS emits them for routing churn, our own scan included, which
  // made a self-triggering rescan loop.
```

Without it, the next person adds a poll or a `network-changed` refetch, since
one looks missing, and brings the loop back. Compare `// scan devices` above
`scanDevices(api)`: it says nothing the name didn't, and goes stale when the
code changes.

The house style: `/** */` on exports, props and type fields, because editors
show it on hover and [components.gen.json](../../../src/ui/components.gen.json)
reads it; `//` for notes inside code. A `//` note runs at most 6 lines and a
`/** */` doc at most 10; anything longer goes in `docs/`. A lint exception says
why after `--` ([return-point.ts](../../../src/app/utils/return-point.ts)):

```ts
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the DOM names the option.
```

---

---

[← How a library component is built](05-library-components.md) · [Accessibility in practice →](07-accessibility.md)
