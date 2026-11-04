import type { JSX } from 'react'

import catalogue from '../src/ui/components.gen.json'
import figma from '../src/ui/figma.json'

const TOKENS_STORYBOOK = 'https://rove.swiftsolve.net/storybook/tokens/'

type Component = { group: string; stories: string[] }
const components = Object.values(catalogue.components as Record<string, Component>)

/** The groups in the library's order, each with its size and the Docs page of its first component. */
const groups = [...new Set(components.map(({ group }) => group))].map((group) => {
  const members = components.filter((component) => component.group === group)
  const firstStory = members.find(({ stories }) => stories.length > 0)?.stories[0]
  return { group, count: members.length, docsId: firstStory?.replace(/--.*$/, '--docs') }
})

/** A Docs page's address, from inside Storybook's preview frame. */
const docsHref = (id: string): string => `./?path=/docs/${id}`

/** The library's front page: what it is, where to start, and how it stays on-system. */
export function Introduction(): JSX.Element {
  return (
    <>
      <h1>Rove Components</h1>
      <p>
        Rove&rsquo;s interface as a React library: the components of the{' '}
        <a href={figma.file} target="_blank" rel="noreferrer">
          Rove Design System
        </a>
        , in code. {components.length} components, each with its props, stories and a usage guide.
      </p>

      <h2>Start here</h2>
      <ul>
        <li>
          <strong>Designing:</strong> the{' '}
          <a href={figma.file} target="_blank" rel="noreferrer">
            Figma file
          </a>{' '}
          is the source of truth. The tokens are in{' '}
          <a href={TOKENS_STORYBOOK} target="_blank" rel="noreferrer">
            Rove Tokens
          </a>
          .
        </li>
        <li>
          <strong>Building:</strong> import from <code>@/ui</code>. Each component&rsquo;s Docs page says when to use
          it, when not to, and what it does for accessibility.
        </li>
        <li>
          <strong>With an agent:</strong> <code>AGENTS.md</code> routes each task, and <code>components.gen.json</code>{' '}
          lists every prop.
        </li>
      </ul>

      <h2>How it stays on-system</h2>
      <ul>
        <li>
          <strong>Tokens only.</strong> The theme has no other values, and a raw colour or spacing fails lint.
        </li>
        <li>
          <strong>Figma and code agree.</strong> Every Figma variant is checked against its prop.
        </li>
        <li>
          <strong>Every story is a test.</strong> Each one renders in a browser and runs through axe.
        </li>
      </ul>

      <h2>Components</h2>
      <ul>
        {groups.map(({ group, count, docsId }) => (
          <li key={group}>
            {docsId ? (
              <a href={docsHref(docsId)} target="_top">
                {group}
              </a>
            ) : (
              group
            )}{' '}
            ({count})
          </li>
        ))}
      </ul>
    </>
  )
}
