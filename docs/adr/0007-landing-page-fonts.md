---
status: accepted
date: 2026-11-07
---

# The landing page takes Rove's fonts, not its tokens

rove.swiftsolve.net sets its text in Hanken Grotesk and its headings in
Urbanist Bold, with font stacks that mirror rove-tokens' sans and display
families. It doesn't import the tokens themselves.

## Considered options

- **Importing rove-tokens' `tokens.css`.** The page keeps its own palette and
  spacing, and fifteen of its variables share names with tokens (text
  colours, accent, radius, easing), so the import would quietly restyle it.

## Consequences

- **A font change reaches the page by hand.** Its stacks and font files are
  copies, as nabilr.com's copy of the page is.
