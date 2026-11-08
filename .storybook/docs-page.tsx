import { Controls, Description, Primary, Stories, Subtitle, Title, useOf } from '@storybook/addon-docs/blocks'
import { type JSX, useLayoutEffect, useRef } from 'react'

import type { Guidance } from './guidance'

// The stories import Guidance from here, beside GUIDANCE_TOC.
export type { Guidance }

/**
 * The `toc` a page with guidance sets: its title, then its sections and Stories
 * under it. The Subtitle block is an `<h2>` too, so it's skipped; the lists stay
 * open, as tocbot otherwise collapses all but the one in view.
 */
export const GUIDANCE_TOC = {
  headingSelector: 'h1, h2',
  ignoreSelector: '.docs-story *, .skip-toc, .sbdocs-subtitle',
  unsafeTocbotOptions: { collapseDepth: 6 },
  title: 'On this page',
}

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
// (preview.css styles it); the headings stay `<h2>`s, with ids, for the page's
// contents.
function GuidanceSections({ guidance }: { guidance: Guidance }): JSX.Element {
  const { whenToUse, whenNotToUse, accessibility } = guidance
  const sections: { title: string; groups: { label?: string; lines: string[] }[] }[] = [
    { title: 'When to use', groups: [{ lines: whenToUse }] },
    { title: 'When not to use', groups: [{ lines: whenNotToUse }] },
    {
      title: 'Accessibility',
      groups: [
        { label: 'Built in', lines: accessibility.builtIn },
        { label: 'To handle', lines: accessibility.toHandle },
      ],
    },
  ]
  return (
    <div className="guidance sb-unstyled">
      {sections.map(({ title, groups }) => (
        <section key={title}>
          <h2 id={title.toLowerCase().replaceAll(' ', '-')}>{title}</h2>
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

// The contents list links to headings by id, and Storybook's Title renders
// none, so its <h1> takes one here, before the list reads them.
function PageTitle(): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => ref.current?.querySelector('h1')?.setAttribute('id', 'top'), [])
  return (
    <div ref={ref} style={{ display: 'contents' }}>
      <Title />
    </div>
  )
}

/** Every component's Docs page: Storybook's own, plus the guide when the stories set one. */
export function DocsPage(): JSX.Element {
  const { preparedMeta } = useOf('meta', ['meta'])
  const guidance = preparedMeta.parameters.guidance as Guidance | undefined
  return (
    <>
      <PageTitle />
      <Subtitle />
      <Description />
      {guidance && <GuidanceSections guidance={guidance} />}
      <Primary />
      <Controls />
      <Stories />
    </>
  )
}
