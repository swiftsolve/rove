# Checks and review

Part 8 of [Learning Rove's UI](README.md).

[← Accessibility in practice](07-accessibility.md) · [Contents →](README.md)

## What ✓ CHECKED means

Some rules in [src/README.md](../../../src/README.md) and
[src/ui/README.md](../../../src/ui/README.md) end with a tag like
**[✓ CHECKED by `checks/raw-values.mjs`]**. It means `npm run check` fails if
you break the rule, and the file it names is the check, so you can open it to
see exactly what counts. A rule without the tag is judgment: nothing stops
you, and review has to notice.

Why bother marking which is which: some rules can be checked by a script ("no
raw colour") and some can't ("a comment says why"). The tag tells you which
you can lean on, and where you're on your own.

## What `npm run check` runs

From [package.json](../../../package.json):

```json
    "check": "npm run typecheck && npm run lint && npm test",
```

In order: TypeScript; ESLint, Prettier and every script in `scripts/checks`
(through [run.mjs](../../../scripts/checks/run.mjs), which also runs each
generator in `scripts/gen` with `--check`); then Vitest, which runs the unit
and DOM tests and every story, with its `play` function and axe.

Each file's opening comment says what it guards. In short:

| File | Fails on |
| --- | --- |
| [eslint.config.js](../../../eslint.config.js) | A feature importing inside `src/ui`, the library importing app code, a context read without its hook; a boolean not named as a question; `interface`; a bare `<button>` outside the library; a typed `·`, `•` or lone `—`; an em dash in copy; a lint exception with no reason |
| [eslint/comments.mjs](../../../scripts/eslint/comments.mjs) | A `//` note over 6 lines, a `/** */` doc over 10 |
| [checks/raw-values.mjs](../../../scripts/checks/raw-values.mjs) | A raw colour or easing, a value that has a token (`p-[12px]`), spacing or a corner off the scale |
| [checks/text-styles.mjs](../../../scripts/checks/text-styles.mjs) | A font size with no text style |
| [checks/ui-classname.mjs](../../../scripts/checks/ui-classname.mjs) | A `className` that restyles a library component instead of placing it |
| [checks/custom-properties.mjs](../../../scripts/checks/custom-properties.mjs) | A `var(--…)` nothing defines, such as a typo |
| [checks/figma-library.mjs](../../../scripts/checks/figma-library.mjs) | The library and the Figma file disagreeing: a node, a name, a variant's values, a usage guide's lines (skipped without `FIGMA_TOKEN`) |
| [gen/components.mjs](../../../scripts/gen/components.mjs) | A stale `components.gen.json`; a component or prop without a doc comment, a Figma entry or a usage guide; a handler no `play` story drives |
| [gen/cn-theme.mjs](../../../scripts/gen/cn-theme.mjs) | A stale `cn-theme.gen.json`, so `cn` would miss a theme name ([chapter 3](03-cva-cx-cn.md)) |

## Exceptions carry a reason

Sometimes a raw value is right. The check doesn't ban it; it wants the reason
written down, beside the exception
([raw-values.mjs](../../../scripts/checks/raw-values.mjs)):

```js
  // A scanner needs dark modules on white in both themes.
  { file: 'src/features/connection/components/WifiShareDialog.tsx', value: '#ffffff' },
```

Why bother: an exception is fine, an unexplained one is how a design system
drifts. Six months on, nobody can tell a deliberate white from a forgotten one.
A lint exception works the same way, with its reason after `--`
([chapter 6](06-where-code-goes.md)).

## Generated files

`components.gen.json` and `cn-theme.gen.json` are written by `npm run gen`
from the code, never by hand. The code is the source; the file is a view of
it that's easy to read in one go. `--check` fails when the file is stale, so
the view can't quietly fall behind the code.

The checks also run before you ask: on each edit (in Claude Code), each commit
and each push. Which stage runs what:
[README.md: Check a change](../../../README.md#check-a-change).

## What review still catches

The checks hold the mechanical rules. The list in
[src/README.md: What review catches](../../../src/README.md#what-review-catches)
is the judgment ones that slip most, and each slips for a reason.

Things only a person can judge:

- **A prop passed only to pass it down.** A linter sees a prop being used;
  it can't tell it's only forwarded ([chapter 4](04-state-and-context.md)).
- **Focus code after `navigate`, or an exit unmounted early.** Both run fine;
  they're just wrong ([chapters 4](04-state-and-context.md) and
  [7](07-accessibility.md)).
- **A comment that restates the code, or a hint that explains how it works.**
  The length is checked, the meaning isn't ([chapter 6](06-where-code-goes.md)).

Things no automatic check looks at:

- **The light theme, and any whole screen.** Chromatic snapshots only stories,
  in dark. So run `npm run screenshots` in both themes and read the pictures.
- **A screen, subpage or dialog without `npm run a11y`.** Story tests run axe
  on components, not on screens put together.
- **Figma beyond its variants and guides.** The Figma check compares variant
  properties and guide lines, not a component's spacing or a line's wording.

Green checks mean the mechanical rules hold. They don't mean the change is
done.

---

---

[← Accessibility in practice](07-accessibility.md) · [Contents →](README.md)
