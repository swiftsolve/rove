# Tailwind and the design tokens

Part 2 of [Learning TanStack Query & Tailwind through Rove](README.md).

[← TanStack Query](01-tanstack-query.md) · [`cva`, `cx` and `cn` →](03-cva-cx-cn.md)

## The chain, from Figma to a class

```
Figma variables          (the source of truth: colours, spacing, radii, type)
      ↓ exported and built by @swiftsolve/rove-tokens
tokens.css               --spacing-12: 12px;  --bg-surface: #151618;
      ↓ mapped by src/styles/tailwind.css (@theme)
Tailwind utilities       p-12   bg-surface   rounded-md
      ↓ used in components
<div className="p-12 bg-surface">
```

**Tokens** are named design values: `--spacing-12` is 12px, `--bg-surface` is
the card background. They live in Figma. The `@swiftsolve/rove-tokens` package
turns them into CSS variables in
[`tokens.css`](../../../../node_modules/@swiftsolve/rove-tokens/dist/tokens.css). Nobody
edits that file by hand; it's generated.

**Tailwind** gives you small single-purpose classes: `p-12` means
`padding: 12px`. You build a look by combining them in `className`, instead of
writing a CSS file per component.

## Joining the two: `@theme`

[tailwind.css](../../../../src/styles/tailwind.css) tells Tailwind which classes
exist, using the tokens:

```css
@theme inline reference {
  --*: initial;               /* 1. throw away Tailwind's default theme */
  --spacing-12: var(--spacing-12);  /* 2. p-12, gap-12, m-12... use the token */
  --color-surface: var(--bg-surface); /* 3. bg-surface, text-surface... */
}
```

Line by line:

1. **`--*: initial`** deletes Tailwind's built-in values. There is no `p-7`, no
   `text-blue-500`, no `rounded-2xl`. If Figma doesn't have it, the class
   doesn't exist. You can't drift from the design by accident.
2. **`--spacing-12: var(--spacing-12)`** says "make spacing classes named `12`,
   with the token's value".
3. **`--color-surface: var(--bg-surface)`** makes `bg-surface`, pointing at the
   `--bg-surface` token.

The two words after `@theme`:

- **`inline`**: the class uses the token directly. `p-12` becomes
  `padding: var(--spacing-12)`. Without it, Tailwind would point at its own
  copy of the variable, and here that copy would refer to itself
  (`--spacing-12: var(--spacing-12)`), which breaks.
- **`reference`**: don't write these variables into the page again. The tokens
  file already defines them.

## Light and dark for free

The tokens file defines every colour twice:

```css
:root             { --bg-surface: #151618; }  /* dark */
:root.theme-light { --bg-surface: #ffffff; }  /* light */
```

`bg-surface` always means `var(--bg-surface)`. Switching the theme only flips
the `theme-light` class on `<html>`, and every colour in the app changes at
once. No component knows which theme it's in.

## Text styles: the `type-*` classes

Figma has text styles ("Heading small", "Body default", "Caption"). Each one is
a size, weight, line height and letter spacing that belong together.
rove-tokens ships each as a class in `text-styles.css`:

```tsx
<h2 className="type-heading-small">Devices</h2>
<p className="type-caption text-secondary">Updated 2m ago</p>
```

Use `type-*` for text. It keeps the four values matched, as Figma intended,
rather than combining `text-md leading-… tracking-…` by hand.

## The app's own shared styles: `@utility`

Some layouts repeat across screens, like a page's column with its gap and
entrance animation. Those live in
[utilities.css](../../../../src/styles/utilities.css) as Tailwind utilities:

```css
@utility page {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-10);
}
```

Then any screen writes `<div className="page">`. Hovering the class in VS Code
shows this CSS; to find it, search for `@utility page`.

## Two custom variants

Also in `tailwind.css`:

- **`hover:`** is plain `:hover`. (Tailwind's default only applies hover styles
  on devices with a mouse.)
- **`usable:`** means "not disabled and not loading". Write
  `usable:hover:bg-raised`, and a disabled button doesn't light up when
  hovered.

## Guard rails

`npm run check` stops you from slipping:

- `scripts/checks/raw-values.mjs` flags a raw colour (`#fff`, `rgb()`) and a
  value that has a token (`p-[12px]` is `p-12`, `text-[13px]` is `text-md`).
- `scripts/checks/ui-classname.mjs` stops a screen restyling a library component
  through `className`. It may place it (margin, width, grid position), not
  change its look. A new look is a new variant in the component.

---

---

[← TanStack Query](01-tanstack-query.md) · [`cva`, `cx` and `cn` →](03-cva-cx-cn.md)
