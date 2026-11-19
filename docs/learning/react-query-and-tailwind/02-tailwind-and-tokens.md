# Tailwind and the design tokens

Part 2 of [Learning Rove's UI](README.md).

Previous: [TanStack Query](01-tanstack-query.md). Next: [`cva`, `cx` and `cn`](03-cva-cx-cn.md).

## The chain, from Figma to a class

```
Figma variables          (the source of truth: colours, spacing, radii, type)
      exported and built by @swiftsolve/rove-tokens into:
tokens.css               --spacing-12: 12px;  --bg-surface: #151618;
tailwind-theme.css       @theme inline reference { --spacing-12: var(--spacing-12); ... }
      imported by packages/ui/src/styles/tailwind.css, which gives:
Tailwind utilities       p-12   bg-surface   rounded-md
      used in components:
<div className="p-12 bg-surface">
```

**Tokens** are named design values: `--spacing-12` is 12px, `--bg-surface` is
the card background. They live in Figma. The `@swiftsolve/rove-tokens` package
turns them into CSS variables in
[`tokens.css`](../../../packages/tokens/dist/tokens.css),
and into the Tailwind theme that maps them to classes,
[`tailwind-theme.css`](../../../packages/tokens/dist/tailwind-theme.css).
Nobody edits either file by hand; both are generated.

**Tailwind** gives you small single-purpose classes: `p-12` means
`padding: 12px`. You build a look by combining them in `className`, instead of
writing a CSS file per component.

## Joining the two: `@theme`

rove-tokens' `tailwind-theme.css` tells Tailwind which classes exist, using the
tokens. [tailwind.css](../../../packages/ui/src/styles/tailwind.css) only
imports it, beside `tokens.css` and `text-styles.css`:

```css
@import '@swiftsolve/rove-tokens/tailwind-theme.css';
```

Three of its lines, with numbered comments added here:

```css
@theme inline reference {
  --*: initial;                       /* 1. throw away Tailwind's default theme */
  --spacing-12: var(--spacing-12);    /* 2. p-12, gap-12, m-12... use the token */
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

So a new token reaches code only through a rove-tokens release: add it in
Figma, release rove-tokens, update the package here, then run `pnpm gen`,
which reads the new theme into the class merger `cn` uses
(`packages/ui/src/utils/cn-theme.gen.json`).

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
<h2 className="type-heading">Devices</h2>
<p className="type-caption text-secondary">Updated 2m ago</p>
```

Use `type-*` for text. It keeps the four values matched, as Figma intended,
rather than combining `text-md leading-… tracking-…` by hand.

## The app's own shared styles: `@utility`

Some layouts repeat across screens, like a page's column with its gap and
entrance animation. Those live in
[utilities.css](../../../packages/ui/src/styles/utilities.css) as Tailwind utilities:

```css
@utility page {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--spacing-10);
  /* ...then the cards' staggered fade-in */
}
```

Then any screen writes `<div className="page">`. Hovering the class in VS Code
shows this CSS; to find it, search for `@utility page`.

## Two custom variants

Also in `tailwind.css`:

- **`hover:`** is plain `:hover`. (Tailwind's default only applies hover styles
  on devices with a mouse.)
- **`usable:`** means "not disabled and not loading". Write
  `usable:hover:bg-hover`, and a disabled button doesn't light up when
  hovered.

## Guard rails

`pnpm check` stops you from slipping:

- `scripts/checks/raw-values.ts` flags a raw colour (`#fff`, `rgb()`) and a
  value that has a token (`p-[12px]` is `p-12`).
- `scripts/checks/text-styles.ts` flags a font size alone (`text-sm`,
  `text-[13px]`): text takes a `type-*` class.
- `scripts/checks/ui-classname.ts` stops a screen restyling a library component
  through `className`. It may place it (margin, width, grid position), not
  change its look. A new look is a new variant in the component.

Previous: [TanStack Query](01-tanstack-query.md). Next: [`cva`, `cx` and `cn`](03-cva-cx-cn.md).
