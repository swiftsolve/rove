# Using the tokens

How the package's files name and hold the tokens. [`DESIGN.md`](../DESIGN.md) says which token to use for what.

## Install

```bash
npm install @swiftsolve/rove-tokens
```

The package ships the tokens built, in `dist/`, and the import paths below point there. You can also install straight from a version tag (`github:swiftsolve/rove-tokens#v4.6.3`). npm then builds the tokens on install, which needs Node 24 (see `.nvmrc`).

## CSS variables

```css
@import '@swiftsolve/rove-tokens/tokens.css';
```

Dark values sit on `:root`, and Light's on `:root.theme-light`, so the `theme-light` class on the root element switches every token at once.

CSS names follow the Figma names, with `/` as `-`: `bg/base` is `--bg-base`, and `spacing/12` is `--spacing-12`.

Every colour lives once, in the Palette collection: `neutral/850`, `blue/450`. Higher numbers are darker, and a see-through shade adds `-a` and its opacity, `neutral/850-a10`. The Color tokens point at the Palette by role. The Palette itself isn't in `tokens.css`: a token that points at a shade gets the shade's value there. Figma-only collections (Icon tone, Capability level) and variables without a code syntax aren't in `tokens.css` either.

## Text styles

Each Figma text style becomes four variables:

| Variable | Holds |
| --- | --- |
| `--type-<style>-size` | The size, or the variable it's bound to (`var(--font-size-3xl)`) |
| `--type-<style>-weight` | The weight |
| `--type-<style>-line-height` | A unitless ratio |
| `--type-<style>-letter-spacing` | In `em`, so it scales with the size |

`Body/Medium` gives `--type-body-medium-size` and so on.

`text-styles.css` applies a style whole:

```css
@import '@swiftsolve/rove-tokens/text-styles.css';
```

`.type-title` sets the font family, the four variables and the text case (Badge is uppercase). The classes set no colour and sit in `@layer components`, so Tailwind utilities on the same element still win.

## Tailwind

`tailwind-theme.css` is a [Tailwind v4](https://tailwindcss.com/docs/theme) theme made of the tokens and nothing else. Import it with the tokens, in the CSS file that sets Tailwind up:

```css
@import '@swiftsolve/rove-tokens/tokens.css';
@import '@swiftsolve/rove-tokens/tailwind-theme.css';
```

It clears Tailwind's own scales, so `p-12` is `--spacing-12`, `text-sm` is `--font-size-sm` and `bg-surface` is `--bg-surface`. There's no `p-7` or `text-blue-500` to reach for. Each utility uses the token itself (`padding: var(--spacing-12)`), so the theme switch flows through.

Colours drop the group the utility already says:

| Token | Utility |
| --- | --- |
| `bg/surface` | `bg-surface` |
| `text/primary` | `text-primary` |
| `text/accent` | `text-accent-text` |
| `border/default` | `border-line` |
| `status/positive` | `bg-status-positive` (status, series, overlay and focus keep their group) |

Each text style also gives `leading-<style>` and `tracking-<style>`, for text that matches a style but takes its own size.

## DTCG files

`dist/tokens/`, imported as `@swiftsolve/rove-tokens/tokens/*`, holds the same tokens in the [Design Tokens Format](https://www.designtokens.org/tr/2025.10/format/) (2025.10), for Style Dictionary, Tokens Studio and similar tools.

| File | What |
| --- | --- |
| `palette.tokens.json` | Every colour, once |
| `color.dark.tokens.json`, `color.light.tokens.json` | The Color tokens in each theme, pointing at the palette (`{neutral.850}`) |
| `spacing.tokens.json`, `typography.tokens.json`, `opacity.tokens.json`, `layout.tokens.json`, `motion.tokens.json` | The other Figma collections |
| `text-styles.tokens.json` | Each text style as a `typography` token |
| `code.tokens.json` | The code-only tokens: shadows and the focus outline |

A theme is every file plus one of the two color files. Paths follow the Figma names: `bg/base` is `bg.base`.

Tokens that others point at but that aren't CSS variables (the palette, the shadow colours) are marked `"$extensions": { "net.swiftsolve.rove-tokens": { "css": false } }`. CSS-only expressions (`--focus-inset`, a `calc()`) aren't in the DTCG files.

## Contrast

The colours meet [WCAG 2.2](https://www.w3.org/TR/WCAG22/) level AA in both themes, on the surfaces they sit on:

- Text clears 4.5:1 ([1.4.3 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)).
- Icons, bars and dots clear 3:1 ([1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)).

AAA (7:1) isn't a target. `scripts/checks/contrast.ts` measures every pair in `npm run check`, which runs before every release, so a release can't break this. [Rationale](rationale.md) has the close calls.
