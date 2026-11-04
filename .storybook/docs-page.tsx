import { Controls, Description, Primary, Stories, Subtitle, Title, useOf } from '@storybook/addon-docs/blocks'
import type { JSX } from 'react'

/**
 * A component's usage guide, set as its stories' `guidance` parameter and shown
 * on its Docs page above the stories. Each line is a few words, with `code` in backticks.
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

/** A line's `code` spans as `<code>`; the guides use no other Markdown. */
function Line({ text }: { text: string }): JSX.Element {
  return <>{text.split('`').map((part, i) => (i % 2 === 1 ? <code key={i}>{part}</code> : part))}</>
}

function Lines({ label, lines }: { label?: string; lines: string[] }): JSX.Element {
  return (
    <div className="guidance-group">
      {label && <p className="guidance-label">{label}</p>}
      <ul>
        {lines.map((line) => (
          <li key={line}>
            <Line text={line} />
          </li>
        ))}
      </ul>
    </div>
  )
}

// As in Figma's Guidance block: a 2×2 grid of sections under hairlines.
// `sb-unstyled` keeps Storybook's prose styles off it (preview.css styles it);
// the headings stay `<h2>`s for the page's contents.
function GuidanceSections({ guidance }: { guidance: Guidance }): JSX.Element {
  const { use, avoid, states, accessibility } = guidance
  const sections: { title: string; groups: { label?: string; lines: string[] }[] }[] = [
    { title: 'When to use', groups: [{ lines: use }] },
    { title: 'When not to use', groups: [{ lines: avoid }] },
    { title: 'States', groups: [{ lines: states }] },
    {
      title: 'Accessibility',
      groups: [
        { label: 'Built in', lines: accessibility.builtIn },
        { label: 'Up to you', lines: accessibility.yours },
      ],
    },
  ]
  return (
    <div className="guidance sb-unstyled">
      {sections.map(({ title, groups }) => (
        <section key={title}>
          <h2>{title}</h2>
          {groups.map((group) => (
            <Lines key={group.label ?? title} {...group} />
          ))}
        </section>
      ))}
    </div>
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
