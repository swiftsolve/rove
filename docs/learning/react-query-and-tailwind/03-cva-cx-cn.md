# `cva`, `cx` and `cn`

Part 3 of [Learning Rove's UI](README.md).

Previous: [Tailwind and the design tokens](02-tailwind-and-tokens.md). Next: [State and context](04-state-and-context.md).

Three small helpers for building `className` strings.

## `cva`: a component's variants

`cva` (from `class-variance-authority`) describes a component's looks as data:
the classes every version shares, plus the classes for each option. From
[Badge.tsx](../../../packages/ui/src/badge/Badge.tsx):

```ts
const badgeVariants = cva('type-badge inline-flex shrink-0 items-center rounded-full px-8 py-4', {
  variants: {
    tone: {
      positive: 'bg-status-positive/(--opacity-tint-md) text-positive',
      warning: 'bg-status-warning/(--opacity-tint-md) text-warning',
      negative: 'bg-status-negative/(--opacity-tint-md) text-negative',
    },
  },
})

badgeVariants({ tone: 'warning' })
// → 'type-badge inline-flex shrink-0 items-center rounded-full px-8 py-4 bg-status-warning/(--opacity-tint-md) text-warning'
```

Why bother: every option is listed in one place, TypeScript knows the allowed
values (`'positive' | 'warning' | 'negative'`), and the props match the Figma
component's variants one to one. Rove's component list
([components.gen.json](../../../packages/ui/catalog/components.gen.json)) reads these to document every
component.

## `cx`: just join

`cx` glues class names together and skips anything falsy:

```ts
cx('rounded-md p-12', isOpen && 'bg-inset')
// isOpen true  → 'rounded-md p-12 bg-inset'
// isOpen false → 'rounded-md p-12'
```

It doesn't understand what the classes do. `cx('px-12', 'px-8')` gives you
both, and which one wins depends on the order in the generated CSS, not on
which you wrote last.

## `cn`: join, and let the last one win

[`cn`](../../../packages/ui/src/utils/cn.ts) is `cx` plus **tailwind-merge**, which
knows that `px-12` and `px-8` both set horizontal padding and keeps only the
last:

```ts
cn('px-12 py-4', 'px-8')  // → 'py-4 px-8'
```

This matters when a component accepts a `className` from outside:

```tsx
function Badge({ tone, className }) {
  return <span className={cn(badgeVariants({ tone }), className)} />
}

<Badge tone="warning" className="px-12" />  // the caller's px-12 replaces px-8
```

With `cx` instead, the element would get both `px-8` and `px-12`, and the
result would depend on CSS order.

`cn` has one catch. tailwind-merge has to know Rove's custom names, or it
mixes them up: it would read `text-md` (a size) and `text-secondary` (a colour)
as two colours and drop one. So `npm run gen` reads every theme name from
`tailwind.css` and every `type-*` class from rove-tokens into
`cn-theme.gen.json`, which `cn.ts` hands to tailwind-merge. A later `type-*` class replaces an earlier
one, and any size, weight or spacing before it; a utility after it tweaks it.

## Which one when

| You're writing | Use |
| --- | --- |
| A component with options (size, tone, layout) | `cva` |
| A component that takes `className` from outside | `cn(ownClasses, className)` |
| Fixed classes, maybe with a condition, nothing from outside | `cx` |

`cn` everywhere would work, but it costs a parse on every render, and seeing
`cn` should tell a reader "this component accepts overrides".

Previous: [Tailwind and the design tokens](02-tailwind-and-tokens.md). Next: [State and context](04-state-and-context.md).
