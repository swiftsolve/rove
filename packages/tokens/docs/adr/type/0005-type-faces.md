---
status: accepted
date: 2026-11-07
---

# Urbanist for headings, Hanken Grotesk for everything else

Rove set text in Inter and numbers in Questrial, whose digits ran 5% short of
Inter's capitals and which had one weight, so live speeds were faked bold. We
now set the wordmark, titles and headings in Urbanist Bold, and everything
else, numbers included, in Hanken Grotesk: its digits are all one width, as
tall as its capitals and Urbanist's, and it has real weights from 100 to 900.
The [rationale](../../rationale.md#type) has the measurements.

## Considered options

- **Cal Sans for headings.** Shipped briefly. It has one weight and reads
  heavy at small sizes, and on the screens it looked better replaced by
  Urbanist, whose rounder geometry sits closer to Hanken's text.
- **Urbanist for numbers too.** Its digits vary in width and its 1 is narrow,
  so addresses crowd and a live figure shifts sideways as it updates.
- **Outfit or Jost for numbers,** for their single-storey a. Jost's lowercase
  is small and Outfit's digits wider; Hanken's same-width digits won.

## Consequences

- **Urbanist stays out of small UI text.** Buttons, chips and badges are
  Hanken, so Urbanist keeps marking titles and headings.
- **Numbers have no face of their own.** The separate number font token is
  gone; a figure takes the text style around it, with tabular digits.
