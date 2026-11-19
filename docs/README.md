# Rove docs

## Develop

Working on Rove's code.

- [Rove frontend](../apps/rove/src/README.md): how the UI is organised, styled and
  tested, and where to find which component to use. Adding a screen or new
  backend data are the [add-screen](../.claude/skills/add-screen/SKILL.md) and
  [add-backend-data](../.claude/skills/add-backend-data/SKILL.md) skills.
- [Rove UI library](../packages/ui/README.md): how `packages/ui/` is built: its stories,
  docs pages and the rules every component follows. Adding a component is the
  [add-library-component](../.claude/skills/add-library-component/SKILL.md) skill.
- [How Rove Is Put Together](architecture.md): the bridge between the
  UI and the backend, commands and events.
- [Learning Rust & Tauri through Rove](learning/rust-and-tauri/README.md): the
  same boundary from the language side, and adding a command end to end.
- [Learning Rove's UI](learning/react-query-and-tailwind/README.md): the why
  behind the UI's rules, in plain words: TanStack Query, styling from a Figma
  token to a class, state and context, how a library component is built, where
  code goes, accessibility, and what the checks catch.
- [The Home page, line by line](learning/home-page/README.md): every file
  behind the Home page, its code beside plain-words notes: the cards, the
  library pieces, the hooks and React Query, with a glossary.
- [ARIA in Rove](aria.md): every ARIA attribute and role the UI uses, where,
  and why, with examples.

## Networking

How the features measure what they show.

- [What Rove Measures, and How](what-rove-measures.md): each feature's source
  of truth, what it can miss, and the tool on each OS.
- [How Rove Captures Network Data (per OS)](networking/data-capture.md)
- [How Rove Discovers & Identifies LAN Devices](networking/device-discovery.md)
- [The Networking Protocols Behind Rove's Device Discovery](networking/protocols.md)

## Decisions

Why things are the way they are, one record per choice, under `adr/`.

### Architecture

- [0001: A Tauri shell over a Rust core crate that knows nothing of Tauri](adr/architecture/0001-tauri-with-a-rust-core.md)
- [0002: The UI talks to one interface, which a browser mock can stand in for](adr/architecture/0002-bridge-seam-and-browser-mock.md)
- [0003: The UI pulls; Rust pushes only what the UI can't ask for](adr/architecture/0003-pull-by-default.md)

### Design system

- [0006: Components start in code, and Figma mirrors them](adr/design-system/0006-components-start-in-code.md)
- [0008: Styles are Tailwind utilities from the token theme, with no defaults](adr/design-system/0008-tailwind-on-the-token-theme.md)
- [0011: The UI library takes only props, and a view's className only places it](adr/design-system/0011-library-takes-only-props.md)
- [0013: Every story is a test, with accessibility checked](adr/design-system/0013-stories-are-tests.md)

### Frontend

- [0007: The desktop app handles back and forward shortcuts itself](adr/frontend/0007-history-shortcuts.md)
- [0009: Backend data lives in TanStack Query, keyed by network; streams in module stores](adr/frontend/0009-tanstack-query-for-backend-data.md)
- [0010: App-wide state comes from small contexts; views take no props](adr/frontend/0010-small-contexts-not-props.md)
- [0012: Navigation runs on the window's history, one entry per screen](adr/frontend/0012-navigation-on-history.md)

### Privacy and data

- [0004: Nothing about the hosts you talk to leaves the machine](adr/privacy-and-data/0004-peer-data-stays-local.md)
- [0005: Bundled lookup tables come from sources a binary may redistribute](adr/privacy-and-data/0005-redistributable-bundled-data.md)
## Project

Background.

- [Why "Rove"?](why-rove.md)

`assets/` holds the docs' diagrams, drawn by `pnpm diagrams` in the style
[`assets/README.md`](assets/README.md) sets, and `screenshots/` the app's
screens (`pnpm screenshots`).
