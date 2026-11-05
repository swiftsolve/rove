import { Controls, Description, Primary, Stories, Subtitle, Title, useOf } from '@storybook/addon-docs/blocks'
import { type JSX, useLayoutEffect, useRef } from 'react'

/**
 * A component's usage guide, set as its stories' `guidance` parameter and shown
 * on its Docs page above the stories. Each line is a few words, with `code` in backticks.
 */
export type Guidance = {
  /**
   * When to use it: each line a situation, then how if it needs saying, then an
   * example ("The page’s main action, solid: “Run test”.").
   */
  whenToUse: string[]
  /** When not to use it: each line a situation, then what to use instead ("…: use `Link`."). */
  whenNotToUse: string[]
  /**
   * For whoever builds with it, in code terms. Figma's docs section has its own,
   * for whoever designs with it, so the two aren't line for line.
   */
  accessibility: {
    /** What the component does for you: its element, roles, names, keyboard. */
    builtIn: string[]
    /** What you pass or write around it: props, labels, wrapping markup. */
    toHandle: string[]
  }
}

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
