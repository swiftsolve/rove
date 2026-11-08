# The Home page, line by line

A plain-words walk through every line of the code behind Rove's Home page: the
page itself, then each card on it, from top to bottom. Each chapter shows a
file's lines in a table, with what each one does and why.

Line numbers match commit `7c2d8fe` (8 November 2026). The code moves on, so
if a line has shifted, look for the code quoted beside it.

> **Companion pages:**
> - [Learning Rove's UI](../react-query-and-tailwind/README.md): why the UI is
>   built the way it is (TanStack Query, Tailwind and tokens, `cva`).
> - [Rove frontend](../../../src/README.md): the rules the code follows.
> - [Rove UI library](../../../src/ui/README.md): the components it's built from.

## Contents

1. [The big picture](01-overview.md)
2. [`HomeView.tsx`: the page itself](02-home-view.md)
3. [The network card: `ConnectionCard` and `ConnectionStrip`](03-connection-card.md)
4. [What opens below it: `ConnectionDetailsPanel` and `SignalMeter`](04-connection-details.md)
5. [The Traffic card](05-traffic-card.md)
6. [The Capabilities card](06-capabilities-card.md)
7. [The Usage and Devices cards](07-usage-and-devices.md)
8. [Glossary](08-glossary.md)
