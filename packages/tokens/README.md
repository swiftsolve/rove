<div align="center">

<img src="docs/assets/rove-mark.svg" width="72" height="72" alt="Rove Mark">

# Rove Tokens

Tokens for Rove, straight from the Rove Design System in Figma.

`@swiftsolve/rove-tokens`

[![Build](https://img.shields.io/github/actions/workflow/status/swiftsolve/rove-tokens/build.yml?label=build&labelColor=17181b)](https://github.com/swiftsolve/rove-tokens/actions/workflows/build.yml)
[![Slideshow](https://img.shields.io/github/actions/workflow/status/swiftsolve/rove-tokens/presentation.yml?label=slideshow&labelColor=17181b)](https://github.com/swiftsolve/rove-tokens/actions/workflows/presentation.yml)
[![Version](https://img.shields.io/github/package-json/v/swiftsolve/rove-tokens?label=version&labelColor=17181b&color=5b8cff)](https://github.com/swiftsolve/rove-tokens/tags)
[![Figma](https://img.shields.io/badge/Figma-source_of_truth-5b8cff?logo=figma&logoColor=white&labelColor=17181b)](https://www.figma.com/design/NoICIoyhWNOya9tOnNfEhH/Rove-Design-System)
[![DTCG](https://img.shields.io/badge/DTCG-2025.10-5b8cff?labelColor=17181b)](https://www.designtokens.org/tr/2025.10/format/)
[![Style Dictionary](https://img.shields.io/badge/Style_Dictionary-5-5b8cff?labelColor=17181b)](https://styledictionary.com/)
[![WCAG](https://img.shields.io/badge/WCAG_2.2-AA-5b8cff?labelColor=17181b)](#-contrast)
[![Themes](https://img.shields.io/badge/themes-Dark_·_Light-5b8cff?labelColor=17181b)](#-use)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-5b8cff?logo=nodedotjs&logoColor=white&labelColor=17181b)](.nvmrc)

[🎨 Figma file](https://www.figma.com/design/NoICIoyhWNOya9tOnNfEhH/Rove-Design-System) &nbsp;·&nbsp;
[🖼️ Slideshow](https://swiftsolve.github.io/rove-tokens/) &nbsp;·&nbsp;
[📐 DESIGN.md](DESIGN.md) &nbsp;·&nbsp;
[💡 Rationale](docs/rationale.md)

</div>

---

Figma is the source of truth; this package turns its variables and text styles into DTCG token files, and those into CSS with [Style Dictionary](https://styledictionary.com/).

> [!TIP]
> **Building Rove UI?** [`DESIGN.md`](DESIGN.md) says which token to use for what, with every value. It ships in the package, so coding agents in Rove can read it from `node_modules/@swiftsolve/rove-tokens/DESIGN.md`.

## 📦 Use

```bash
npm install @swiftsolve/rove-tokens
```

The package ships `tokens.css`, `text-styles.css` and `tokens/` built. You can also install straight from a version tag (`github:swiftsolve/rove-tokens#v1.0.0`); then npm builds them on install, which needs Node 22 (see `.nvmrc`).

```css
@import '@swiftsolve/rove-tokens/tokens.css';
@import '@swiftsolve/rove-tokens/text-styles.css'; /* optional: a class per text style */
```

Dark values sit on `:root`, Light values on `:root.theme-light`. CSS names follow the Figma names: `bg/base` is `--bg-base`, `spacing/12` is `--spacing-12`.

Each Figma text style becomes four tokens: `--type-<style>-size`, `-weight`, `-line-height` (a unitless ratio) and `-letter-spacing` (in `em`). `Number/Display` gives `--type-number-display-size` and so on. A size bound to a variable comes through as that variable (`var(--font-size-3xl)`).

`text-styles.css` applies a style whole: `.type-heading-large` sets the font family and all four, plus the text case (Overline is uppercase). The classes set no colour and sit in `@layer components`, so Tailwind utilities on the same element still win.

### 🧩 DTCG

`tokens/` holds the same tokens in the [Design Tokens Format](https://www.designtokens.org/tr/2025.10/format/) (2025.10), for Style Dictionary, Tokens Studio and similar tools:

| File | What |
| --- | --- |
| `palette.tokens.json` | Every colour, once |
| `color.dark.tokens.json`, `color.light.tokens.json` | The Color tokens in each theme, pointing at the palette (`{neutral.850}`) |
| `spacing.tokens.json`, `typography.tokens.json`, `opacity.tokens.json`, `layout.tokens.json`, `motion.tokens.json` | The other Figma collections |
| `text-styles.tokens.json` | Each text style as a `typography` token |
| `code.tokens.json` | The code-only tokens (shadows, easing curves, the focus outline) |

A theme is every file plus one of the two color files. Paths follow the Figma names (`bg/base` is `bg.base`). Tokens that other tokens point at but that aren't CSS variables (the palette, the shadow colours) are marked `"$extensions": { "net.swiftsolve.rove-tokens": { "css": false } }`. CSS-only expressions (`--focus-inset`, a `calc()`) aren't in them.

## ♿ Contrast

The colours meet [WCAG 2.2](https://www.w3.org/TR/WCAG22/) level AA in both themes, on the surfaces they sit on: text clears 4.5:1 ([1.4.3 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)), and icons, bars and dots 3:1 ([1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)). AAA (7:1) isn't a target. [Rationale](docs/rationale.md) has the close calls.

## 📖 Storybook

**Rove Tokens** is a Storybook of every token in both themes: colour, palette, type, spacing, radius, effects, motion and layout.

```bash
npm run storybook
```

It opens on <http://localhost:6007>; the Theme menu in the toolbar switches Dark and Light. The pages read the DTCG files in `tokens/` and are styled with `tokens.css`, so a new build shows up without editing them. `npm run build:storybook` writes a static copy to `storybook-static/`.

## 🔄 Update the tokens

1. Change the variables or text styles in Figma.
2. Export them to `src/figma/variables.json` and `src/figma/text-styles.json`, either with the plugin in `figma-plugin/` (Figma desktop: Plugins → Development → Import plugin from manifest; then **Export**) or by asking Claude to export them through the Figma connection.
3. Run `npm run build` (Node 22) and check `tokens.css`. It writes the DTCG files, then generates `tokens.css` from them with Style Dictionary and `text-styles.css` from the text styles, then rewrites the token reference at the end of `DESIGN.md`. The build stops if a variable's code syntax doesn't match its name, or a DTCG reference doesn't resolve.
4. Commit the change.

## 🚀 Release

1. On the Figma cover (`COVER` page), set **Version** to the one you're about to release and **Updated** to today's date (`27 Oct 2026`). They're the one place a release can't be stamped from here: Figma's API can't edit canvas text on this plan, so do it by hand or ask Claude to through the Figma connection.
2. Bump, commit and tag in one step, then push both:

   ```bash
   npm version minor
   ```

   ```bash
   git push --follow-tags
   ```

   Use `patch` for fixes and `major` for breaking changes.
3. The tag runs three workflows: **Build** checks the tokens, **Publish** puts the version on [npm](https://www.npmjs.com/package/@swiftsolve/rove-tokens), and **Presentation** exports the Figma file and republishes <https://swiftsolve.github.io/rove-tokens/>. The page's header shows the version from `package.json`. To republish the slideshow between releases (after Figma edits), run Presentation by hand from the Actions tab.
4. Update Rove to the new version (`npm install @swiftsolve/rove-tokens@latest`).

## 🗂️ What's where

| Path | What |
| --- | --- |
| `src/figma/variables.json` | Raw Figma export. Every variable with a Web code syntax becomes that CSS variable. |
| `src/figma/text-styles.json` | Raw export of the local text styles: font, size, weight, line height, letter spacing, text case (when set) and the variables bound to them. Each style becomes a `--type-*` group. |
| `figma-plugin/` | The Figma plugin that writes the two exports. |
| `src/code-tokens.json` | What Figma variables can't hold: font stacks for the font-family variables, shadows, easing curves and the CSS expressions built on variables (`--focus-outline`). `{figma/name}` pulls a Figma value in per theme. |
| `DESIGN.md` | How to build Rove UI with the tokens. The rules at the top are written by hand; the token reference below the marker line is generated by the build. |
| `scripts/tokens/build.mjs` | `npm run build`: runs the steps below and writes `tokens.css` and `text-styles.css` at the package root, where the import paths point. |
| `scripts/tokens/dtcg.mjs` | Figma export → the DTCG files in `tokens/`, checking that every reference resolves in both themes. |
| `scripts/tokens/css.mjs` | DTCG files → `tokens.css`, with Style Dictionary and a `rove/css` format: Dark on `:root`, what differs in Light on `:root.theme-light`, each text style as four `--type-*` variables (letter spacing included). |
| `scripts/tokens/text-styles.mjs` | DTCG text styles → `text-styles.css`: a `.type-<style>` class per style that reads its `--type-*` variables. |
| `scripts/tokens/design.mjs` | Figma export and `tokens.css` → the token reference in `DESIGN.md`: every token by name and Figma description, with values for the scales (spacing, radius, type, opacity) but not the colours, so nobody copies a hex. |
| `scripts/presentation/export.mjs` | `npm run present`: exports the Figma file's pages to `presentation/index.html`, a slideshow styled with the tokens. Needs `FIGMA_TOKEN` (a Figma personal access token, `file_content:read`) in `.env.local`. |
| `scripts/presentation/open.mjs` | `npm run present:open`: opens the exported presentation in your browser. |
| `.storybook/` | The Rove Tokens Storybook's config, and the Inter and Questrial files it serves. |
| `stories/` | Its pages, one file per sidebar group. `tokens.js` reads the DTCG files. |
| `scripts/presentation/publish.mjs` | `npm run present:publish`: pushes the exported presentation to the `gh-pages` branch, which GitHub Pages serves at <https://swiftsolve.github.io/rove-tokens/>. Each publish replaces the last. |
| `.github/workflows/presentation.yml` | Runs the export and publish on every `v*` tag, or by hand. Needs the `FIGMA_TOKEN` repository secret. |
| `docs/rationale.md` | Why the values are what they are (contrast targets, theme choices). |

Every colour lives once in the Palette collection (`neutral/850`, `blue/450`; higher numbers are darker; a see-through shade adds `-a` and its opacity, `neutral/850-a10`), and the Color tokens point at it. The Palette isn't in `tokens.css`: a token that points at a shade gets the shade's value there. Figma-only collections (Icon tone, Capability level) and variables without a code syntax aren't in `tokens.css` either.
