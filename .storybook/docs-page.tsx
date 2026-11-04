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
  accessibility: {
    /** What the component does for you. */
    builtIn: string[]
    /** What it can't do for you. */
    youHandle: string[]
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

// As in Figma's Guidance block: When to use and When not to use side by side,
// then Accessibility across both, its two lists in the same columns. Sections
// sit under hairlines. `sb-unstyled` keeps Storybook's prose styles off it
// (preview.css styles it); the headings stay `<h2>`s for the page's contents.
function GuidanceSections({ guidance }: { guidance: Guidance }): JSX.Element {
  const { use, avoid, accessibility } = guidance
  const sections: { title: string; groups: { label?: string; lines: string[] }[] }[] = [
    { title: 'When to use', groups: [{ lines: use }] },
    { title: 'When not to use', groups: [{ lines: avoid }] },
    {
      title: 'Accessibility',
      groups: [
        { label: 'Built in', lines: accessibility.builtIn },
        { label: 'You handle', lines: accessibility.youHandle },
      ],
    },
  ]
  return (
    <div className="guidance sb-unstyled">
      {sections.map(({ title, groups }) => (
        <section key={title}>
          <h2>{title}</h2>
          <div className="guidance-groups">
            {groups.map((group) => (
              <Lines key={group.label ?? title} {...group} />
            ))}
          </div>
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
