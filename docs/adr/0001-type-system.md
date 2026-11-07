---
status: accepted
date: 2026-11-07
---

# Urbanist headings, Hanken Grotesk for everything else, at two text sizes

Rove's type was Inter for text and Questrial for numbers, with seventeen text
styles. Questrial's digits ran 5% short of Inter's capitals and it had one
weight, so live speeds were faked bold; the styles had grown to five line
heights and three heading sizes 1px apart. We now set titles and headings in
Urbanist Bold and everything else, numbers included, in Hanken Grotesk, with
nine styles: 12px for text, 11px for meta, and line heights on a 4px grid.
rove-tokens' [rationale](https://github.com/swiftsolve/rove-tokens/blob/main/docs/rationale.md#type)
has the measurements behind each choice.

## Considered options

- **Cal Sans for headings.** Shipped briefly. It has one weight and reads
  heavy at small sizes, and on the screens it looked better replaced by
  Urbanist, whose rounder geometry sits closer to Hanken's text.
- **Urbanist for numbers too.** Its digits vary in width and its 1 is narrow,
  so addresses crowd and a live figure shifts sideways as it updates.
- **Outfit or Jost for numbers.** Single-storey, but Jost's lowercase is small
  and Outfit's digits wider; Hanken's same-width digits, as tall as the
  capitals, won.
- **Keeping a 13px Body.** Three text sizes 1px apart (11, 12, 13) read as
  mistakes rather than levels. We kept 12 and dropped 13, rather than move up
  to 13 and 11, to keep the window compact.

## Consequences

- **Rows follow one rule.** A list row's name is 12px and everything else in
  it (values, hosts, addresses, statuses, times) 11px; a data row's label and
  value are both 12px. Field labels are sentence case, not capitals.
- **A figure's line is its own height** (Display 28/28, Stat 17/20). Taller
  boxes pushed Home past the window, which now opens 653px tall: Home's last
  card plus the 20px bottom inset. A type change that moves Home's height
  moves this number too.
- **Urbanist stays out of small UI text.** Buttons, chips and badges are
  Hanken; the faces' jobs stay legible only while Urbanist is kept to
  titles, headings and the wordmark.
- **Figma's text styles are the source.** They flow through rove-tokens
  (4.3.x) into the `type-*` classes; the landing page and both Storybooks take
  the same two faces from the token stacks.
