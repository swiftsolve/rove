# Accessibility in practice

Part 7 of [Learning Rove's UI](README.md).

Previous: [Where code goes, and naming](06-where-code-goes.md). Next: [Checks and review](08-checks-and-review.md).

Four patterns you'll meet in Rove, for people using a screen reader or the
keyboard. The rules: [packages/ui/README.md: Every component](../../../packages/ui/README.md#every-component),
[Buttons](../../../packages/ui/README.md#buttons), and
[apps/rove/src/README.md: Names and copy](../../../apps/rove/src/README.md#names-and-copy).

## A status region stays mounted

A **live region** (`role="status"`) is an element a screen reader watches:
when its text changes, the new text is read out, without moving focus. The
catch is that a region which appears already holding its text often isn't
read, because the reader only notices changes in regions it already knew
about. So Rove's regions are always there, and only their text changes.

TextField's feedback line (a hint, a result, an error) is one
([TextField.tsx](../../../packages/ui/src/text-field/TextField.tsx)):

```tsx
      {/* Always mounted, so the first message is announced: a region that mounts
          already holding its text often isn't. Empty, it takes no space. */}
      <Field.Description render={<div role="status" />} className={FEEDBACK}>
        {feedback}
      </Field.Description>
```

PageHeader does the same for its `status` ("Checking…") with
[ScreenReaderStatus](../../../packages/ui/src/screen-reader/ScreenReaderStatus.tsx), a
hidden region for words only a screen reader hears:

```tsx
export function ScreenReaderStatus({ className, ...spanProps }: Omit<ComponentProps<'span'>, 'role'>) {
  return <span role="status" className={cn('sr-only', className)} {...spanProps} />
}
```

[PageHeader.tsx](../../../packages/ui/src/page-header/PageHeader.tsx) keeps one under
its title:

```tsx
        {/* Always mounted, so a status that appears is announced: a region that
            mounts already holding its text often isn't. */}
        <ScreenReaderStatus>{status}</ScreenReaderStatus>
```

The status you see beside it is `aria-hidden`, so it isn't read twice.

Why bother: someone who presses Scan again with a screen reader hears nothing
unless something is announced. `{error && <p role="status">…</p>}` looks right
and is often silent.

## Disabled buttons stay focusable

A native `disabled` button leaves the Tab order and ignores the pointer, so
its tooltip never shows, and that's where you'd say why it's off. Speed's Run
test button with no network
([SpeedView.tsx](../../../apps/rove/src/features/speed/SpeedView.tsx)):

```tsx
      <Tooltip content="Connect to a network first">
        <Button variant="solid" icon={PlayIcon} isDisabled>
          Run test
        </Button>
      </Tooltip>
```

`isDisabled` doesn't set `disabled`. It sets `aria-disabled`, so a screen
reader says the button is unavailable, and `data-disabled` for the dimmed look,
and [pressable.ts](../../../packages/ui/src/utils/pressable.ts) swallows the click,
Enter and Space ([chapter 5](05-library-components.md)). The button can still
be reached, so a keyboard user lands on it and hears the reason. Loading works
the same way, with `aria-busy`. Toggle gets the same through Base UI's
`readOnly`.

## Let an exit animation finish: `usePresence`

`{isScanning && <ScanStatus />}` removes the element the moment scanning
stops, so its slide-out never plays.
[usePresence](../../../packages/ui/src/hooks/usePresence.ts) keeps it mounted for as
long as the animation runs:

```ts
export function usePresence(isActive: boolean, exitMs: number): boolean {
  const [isMounted, setIsMounted] = useState(isActive)
  if (isActive && !isMounted) setIsMounted(true)

  useEffect(() => {
    if (isActive) return
    const timeoutId = window.setTimeout(() => setIsMounted(false), exitMs)
    return () => window.clearTimeout(timeoutId)
  }, [isActive, exitMs])

  return isMounted
}
```

[ScanStatus.tsx](../../../apps/rove/src/features/devices/components/ScanStatus.tsx)
takes `isActive` instead of being rendered conditionally, and styles itself as
leaving while it's false:

```tsx
  if (!isMounted) return null
  return (
    <span
      className={scanVariants({ isLeaving: !isActive })}
      role={isLiveRegion ? 'status' : undefined}
      aria-hidden={isActive ? undefined : true}
    >
```

The `aria-hidden` while leaving is the accessible half. The words stay on
screen a moment longer, but they're no longer true, so a screen reader skips
them.

## No value, and dots between values

Two small components stand in for characters you might type.

**NoValue** is a short drawn bar where a value is missing, with words for a
screen reader ([NoValue.tsx](../../../packages/ui/src/no-value/NoValue.tsx)):

```tsx
      <span className="sr-only">{label}</span>
```

A typed "—" is read as "dash", or skipped, which says nothing.
`<NoValue label="Not measured" />` is heard as "Not measured", and the bar
scales with its line. Formatters return `null` for a missing value, and the
caller picks the words
([HistoryCard.tsx](../../../apps/rove/src/features/speed/components/HistoryCard.tsx)):

```tsx
          <Metric label="Ping" value={ping?.value ?? <NoValue label="Not measured" />} unit={ping?.unit} />
```

**DotSeparator** is the small dot between inline items. It's `aria-hidden`, so
it isn't read as "dot", and drawn to sit on the text's middle at any size,
which a typed "·" doesn't. **InlineMeta** joins a list with it and drops empty
items along with their dots
([SpeedTestCard.tsx](../../../apps/rove/src/features/speed/components/SpeedTestCard.tsx)):

```tsx
      <InlineMeta items={[name, connection.band]} />
```

Without a band, you get just the name and no dangling dot. A string like
`` `${name} · ${band}` `` would need its own empty check every time, and can't
hold a drawn dot.

Checks catch the typed characters. What no unit check catches is a whole
screen: `npm run a11y` runs axe on every screen and dialog, in both themes
([chapter 8](08-checks-and-review.md)).

Previous: [Where code goes, and naming](06-where-code-goes.md). Next: [Checks and review](08-checks-and-review.md).
