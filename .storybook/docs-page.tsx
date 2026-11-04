import { Controls, Description, Markdown, Primary, Stories, Subtitle, Title, useOf } from '@storybook/addon-docs/blocks'
import type { JSX } from 'react'

/**
 * A component's usage guide, set as its stories' `guidance` parameter and shown
 * on its Docs page above the stories. Each line is Markdown, a few words long.
 */
export type Guidance = {
  /** Where it's the right choice. */
  use: string[]
  /** Where something else is, naming it. */
  avoid: string[]
  /** What it looks like in each state, and when each applies. */
  states: string[]
  accessibility: {
    /** What the component does for you. */
    builtIn: string[]
    /** What it can't do for you. */
    yours: string[]
  }
}

/** The `toc` a page with guidance sets: its sections, then Stories. */
export const GUIDANCE_TOC = { headingSelector: 'h2', title: 'On this page' }

const list = (lines: string[]): string => lines.map((line) => `- ${line}`).join('\n')

function GuidanceSections({ guidance }: { guidance: Guidance }): JSX.Element {
  const { use, avoid, states, accessibility } = guidance
  return (
    <Markdown>
      {[
        `## When to use\n\n${list(use)}`,
        `## When not to use\n\n${list(avoid)}`,
        `## States\n\n${list(states)}`,
        `## Accessibility\n\n### Built in\n\n${list(accessibility.builtIn)}`,
        `### Up to you\n\n${list(accessibility.yours)}`,
      ].join('\n\n')}
    </Markdown>
  )
}

/** Every component's Docs page: Storybook's own, plus the guide when the stories set one. */
export function DocsPage(): JSX.Element {
  const { preparedMeta } = useOf('meta', ['meta'])
  const guidance = preparedMeta.parameters.guidance as Guidance | undefined
  return (
    <>
      <Title />
      <Subtitle />
      <Description />
      {guidance && <GuidanceSections guidance={guidance} />}
      <Primary />
      <Controls />
      <Stories />
    </>
  )
}
