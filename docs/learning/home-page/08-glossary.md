# Glossary

Part 8 of [The Home page, line by line](README.md).

[← The Usage and Devices cards](07-usage-and-devices.md) · [Contents](README.md)

The words and symbols these files use, in plain terms. For the why behind the
bigger ideas, [Learning Rove's UI](../react-query-and-tailwind/README.md) goes
deeper.

## React

| Term | What it means |
| --- | --- |
| Component | A function that returns what to draw, like `TrafficCard()`. Its name starts with a capital letter, and you use it like a tag: `<TrafficCard />`. |
| Props | The inputs a component is given, written like attributes: `<ConnectionCard info={info} />`. A component's `type …Props` lists them. |
| `children` | Whatever sits between a component's opening and closing tags. `StatCard` draws its `children` as the readout. |
| JSX | The HTML-like syntax inside the code (`<div className="page">`). It turns into JavaScript when the app is built. |
| `{ … }` in JSX | Drops a JavaScript value into the page, like `{display.title}`. |
| `A && <B />` | Shows `B` only if `A` is true. |
| `A ? <B /> : <C />` | Shows `B` if `A` is true, otherwise `C`. |
| `list.map(item => <Tile … />)` | Draws one element per item in a list. |
| `key` | A unique label on each item drawn from a list, so React can tell them apart when the list changes. |
| Hook | A function starting with `use` that gives a component data or abilities: `useNetwork()`, `useSpeedTest()`, `useRef()`. Hooks are only called at the top of a component. |
| `useRef` | A handle on a real element on the page, such as the row of capability tiles. |
| `useId` | A unique id, used to link elements together for screen readers. |
| Context | App-wide state any screen can read without it being passed down, like the current network (`useNetwork()`). |
| Store | Shared memory outside any one component, for data that streams in, like the live traffic and the speed test. Every screen that reads it sees the same values. |
| `return null` | "Draw nothing." |

## TypeScript

| Term | What it means |
| --- | --- |
| `import { X } from '…'` | Brings in `X` from another file. `@/` means the `src/` folder. |
| `import type` | Brings in only a type; it disappears when the app is built. |
| `export` | Lets other files import it. |
| `type X = { … }` | Describes the shape of some data: which fields it has and what kind each is. |
| `string \| null` | "Text, or nothing." The `\|` means "or". |
| `field?: …` | The field is optional: it may be left out. |
| `a ?? b` | Use `a`, or `b` if `a` is empty (`null` or `undefined`). |
| `a?.b` | Read `b` from `a`, or give nothing if `a` is empty, instead of crashing. |
| `const { a, b } = thing` | Takes the `a` and `b` fields out of `thing` into their own names. `{ a: c }` renames `a` to `c` as it does. |
| `/** … */` | A doc comment: describes what follows, and shows when you hover the name in the editor. |
| `//` | A plain comment, usually saying why the code is the way it is. |

## Styling (Tailwind and tokens)

| Term | What it means |
| --- | --- |
| `className="…"` | The styles on an element, as a list of small classes. |
| Utility class | One small style per class: `flex` (lay children in a row), `gap-12` (12px between them), `text-secondary` (the secondary grey), `truncate` (cut long text with "…"). |
| Token | A named design value from Rove's design system, like `--spacing-12` or `--accent-default`. Classes such as `p-12` and `text-accent` use them, so colours and spacing stay consistent and switch with light and dark mode. |
| `type-body`, `type-title`, `type-caption` | Text styles: a size, weight and line height together. |
| `-mx-…`, `-mb-…` | Negative margins, which pull an element out past its parent's padding, for example to stretch a grey band to the card's edges. |
| `sr-only` | Hides something visually but keeps it for screen readers. |
| `cx(…)` | Joins class names into one string. |
| `cva(base, { variants })` | A style recipe: base classes plus options that add classes, like `chevronVariants({ isOpen: true })` adding the rotation. |
| `.module.css` | A small stylesheet beside a component, for the few things utility classes can't say. |

## Accessibility

| Term | What it means |
| --- | --- |
| Screen reader | Software that reads the page aloud for people who can't see it. |
| `aria-label` | The name a screen reader says for an element. |
| `aria-labelledby` | Names an element after another one, by its id (the network card is named by its title). |
| `aria-hidden` | Hides an element from screen readers, for decoration or for text already said elsewhere. |
| `role="meter"` | Tells screen readers an element is a gauge with a value, like the signal bars. |
| Focus | Which element the keyboard is on. Tab moves it; a visible ring shows where it is. |
| Roving focus | A group of items that counts as one Tab stop, moved through with the arrow keys, like the capability tiles. |

[← The Usage and Devices cards](07-usage-and-devices.md) · [Contents](README.md)
