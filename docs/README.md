# Rove docs

## Develop

Working on Rove's code.

- [Rove frontend](../src/README.md): how the UI is organised, styled and
  tested, and where to find which component to use. Adding a screen or new
  backend data are the [add-screen](../.claude/skills/add-screen/SKILL.md) and
  [add-backend-data](../.claude/skills/add-backend-data/SKILL.md) skills.
- [Rove UI library](../src/ui/README.md): how `src/ui` is built: its stories,
  docs pages and the rules every component follows. Adding a component is the
  [add-library-component](../.claude/skills/add-library-component/SKILL.md) skill.
- [How Rove Is Put Together](architecture.md): the bridge between the
  UI and the backend, commands and events.
- [Learning Rust & Tauri through Rove](learning/rust-and-tauri/README.md): the
  same boundary from the language side, and adding a command end to end.
- [Learning TanStack Query & Tailwind through Rove](learning/react-query-and-tailwind/README.md):
  why backend data goes through TanStack Query, and how styling goes from a
  Figma token to a class, with `cva`, `cx` and `cn`.

## Networking

How the features measure what they show.

- [How Rove Captures Network Data (per OS)](networking/data-capture.md)
- [How Rove Discovers & Identifies LAN Devices](networking/device-discovery.md)
- [The Networking Protocols Behind Rove's Device Discovery](networking/protocols.md)

## Project

Background.

- [Why "Rove"?](why-rove.md)

`assets/` holds the docs' diagrams, and `screenshots/` the app's screens
(`npm run screenshots`).
