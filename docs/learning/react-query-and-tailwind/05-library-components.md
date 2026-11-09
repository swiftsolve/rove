# How a library component is built

Part 5 of [Learning Rove's UI](README.md).

[← State and context](04-state-and-context.md) · [Where code goes, and naming →](06-where-code-goes.md)

`src/ui` is the library: Button, Card, Toggle and the rest, the Figma
components in code. Features import them from `@/ui`. Inside, they follow a
few patterns. The rules:
[src/ui/README.md: Every component](../../../src/ui/README.md#every-component)
and [Buttons](../../../src/ui/README.md#buttons).

## Pass the element's props and `ref` through

Button's props start from everything a `<button>` takes
([Button.tsx](../../../src/ui/button/Button.tsx)):

```ts
export type ButtonProps = Omit<ComponentProps<'button'>, 'disabled' | 'children' | 'onClick'> &
  ButtonAppearance & {
```

and whatever the component doesn't use goes on to the element:

```tsx
      {...pressableProps({ isDisabled, isLoading, onClick })}
      {...buttonProps}
```

Why bother: the library can't guess every attribute a caller needs. An
`aria-describedby`, a test id, and the handlers a Tooltip adds to its trigger
all just work. A Button that dropped props it didn't know would silently break
every tooltip put around it.

`ref` is in that rest too. Before React 19 a function component couldn't take
`ref` as a prop, and had to be wrapped in `forwardRef`. Now it's a plain prop,
so it travels with `...buttonProps`. Card names it, because it renders one of
three elements ([Card.tsx](../../../src/ui/card/Card.tsx)):

```tsx
export function Card({ as: Element = 'section', onOpen, linkLabel, className, children, ref, ...props }: CardProps) {
```

The `Omit` is the other half. Button replaces `disabled` with `isDisabled`
([chapter 7](07-accessibility.md) says why), so the native one leaves the type,
and the docs don't list both.

## Compound parts and slots

A card is assembled from parts, each with its own props
([TrafficCard.tsx](../../../src/features/live-throughput/TrafficCard.tsx)):

```tsx
    <Card>
      <CardHeader title="Traffic" icon={<ActivityIcon size={15} />} actions={<LiveBadge updatedAt={throughput.timestamp} />} />
      <CardBody>
```

`actions` is a **slot**: a prop that takes JSX, which CardHeader puts in its
place at the end of the row.

What's ruled out is a parent reaching into its children: `cloneElement` to
slip in props, or searching its own DOM for a child. You can't see either from
where you write `<CardHeader>`, so a prop arrives from nowhere. With parts and
slots, everything a child gets is in the JSX in front of you. When parts must
share something (the title's id that names the card, whether the card opens),
Card keeps it in a small context of its own that CardHeader reads, out of
features' sight.

Tooltip is the one exception, and its code says why
([Tooltip.tsx](../../../src/ui/tooltip/Tooltip.tsx)):

```tsx
  // Base UI lets the trigger's own props win, so a trigger that already has a
  // description gets the joined one set on it directly: the library's one
  // cloneElement (src/ui/README.md, The library).
```

## State as data attributes

Something that changes while you use it (on, open, invalid) is written on the
element as a `data-*` attribute and styled with a variant of the same name.
Toggle's track ([Toggle.tsx](../../../src/ui/toggle/Toggle.tsx)):

```ts
const TRACK = cx(
  'relative shrink-0 w-[36px] h-20 rounded-full border',
  'transition-[background,border-color] duration-(--duration-fast) ease-in-out',
  'bg-inset border-line data-checked:bg-accent data-checked:border-accent',
  STATE_CLASSES,
)
```

Base UI's Switch sets `data-checked` while it's on, and `data-checked:bg-accent`
fills the track then. Why bother: the class string never changes, the state is
in the DOM where devtools show it, and a parent can style on it too (TextField's
border uses `has-data-invalid:`). It's also how Base UI already reports state,
so the library speaks one way.

A look the caller picks (variant, size) goes through the recipe instead
([chapter 3](03-cva-cx-cn.md)). Roughly: set once by a prop, a recipe; flips at
runtime, a data attribute.

## Separate axes

Button's recipe has three axes:

```ts
      variant: {
        /** A solid fill under a white label: a page's main action, or stopping it. */
        solid: 'text-on-solid',
        /** A quiet tinted chip: everything else. */
        soft: null,
      },
      tone: { neutral: null, accent: null, negative: null },
      size: {
        sm: 'gap-6 px-10 py-6 type-body-medium',
        md: 'gap-6 px-(--card-padding) py-10 type-body-semibold',
      },
```

The colour depends on a pair, so it's in `compoundVariants`:

```ts
      {
        variant: 'solid',
        tone: 'negative',
        class: 'bg-status-negative-solid usable:hover:bg-status-negative-solid-hover',
      },
```

Why not a `danger` variant? Because then "danger but soft" and "danger but
small" each need adding, and the list grows with every combination. Separate
axes combine: `<Button variant="solid" tone="negative">` stops a speed test,
and a soft negative one sits on an error banner. They also match Figma's
variant properties (Variant, Tone, Size) one to one, which a check compares
([chapter 8](08-checks-and-review.md)).

## Base UI underneath

Some behaviour is hard to get right: a dialog that traps focus and closes on
Escape, a menu you move through with arrow keys, a tooltip that keeps itself on
screen. The library takes it from Base UI (`@base-ui/react`), which renders
unstyled parts, and styles them with tokens. Toggle is Base UI's `Switch.Root`
and `Switch.Thumb` with Rove's classes.

Features never import Base UI: they get `Toggle` from `@/ui`. Why: one place
to upgrade it, and one place its quirks are handled, like this one in Toggle:

```tsx
      // Read-only, not disabled: Base UI's disabled sets the native attribute,
      // which drops the switch out of the Tab order.
      readOnly={isDisabled}
```

## Pressable and `usable:`

Every pressable in the library (Button, IconButton, Link, ListRow) treats
disabled and loading the same way, through
[pressable.ts](../../../src/ui/utils/pressable.ts). It marks the element and
swallows the click:

```ts
    onClick: (event: MouseEvent<HTMLButtonElement>) => {
      if (isInert) {
        event.preventDefault()
        return
      }
      onClick?.(event)
    },
```

The button underneath stays enabled, so CSS `:hover` still fires on a disabled
one. The `usable:` variant, from [tailwind.css](../../../src/styles/tailwind.css),
covers that:

```css
@custom-variant usable (&:not([data-disabled], [data-loading]));
```

So `usable:hover:bg-hover` applies only while the button would do something,
and a disabled one doesn't light up as if you could press it.

---

---

[← State and context](04-state-and-context.md) · [Where code goes, and naming →](06-where-code-goes.md)
