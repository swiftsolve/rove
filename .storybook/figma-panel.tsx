// The manager builds with the classic JSX transform, so JSX needs React in scope.
import React from 'react'
import { AddonPanel, EmptyTabContent, Link } from 'storybook/internal/components'
import { useStorybookApi, useStorybookState } from 'storybook/manager-api'

import figma from '../src/ui/figma-components.json'

type FigmaNode = { figmaName: string; figmaNodeId: string }
type NoFigmaNode = { whyNoFigmaComponent: string }

// A story's title ends in its component's name ('Containers/Card/CardHeader'),
// which is figma-components.json's key, so every story finds its Figma component with
// nothing set on the story itself.
const COMPONENTS: Record<string, FigmaNode | NoFigmaNode> = figma.components
const FILE = new URL(figma.figmaFileUrl)

const COLUMN: React.CSSProperties = { display: 'flex', flexDirection: 'column', height: '100%' }
const EMBED: React.CSSProperties = { flex: 1, width: '100%', border: 0 }

/** The Figma component beside the current story. */
export function FigmaPanel({ isActive }: { isActive: boolean }): JSX.Element {
  const api = useStorybookApi()
  // Re-renders the panel when the story changes.
  useStorybookState()
  const title = api.getCurrentStoryData()?.title ?? ''
  const name = title.split('/').at(-1) ?? ''
  const component = COMPONENTS[name]

  return (
    <AddonPanel active={isActive}>
      {component && 'figmaNodeId' in component ? (
        <div style={COLUMN}>
          {/* Only while the tab is open, so other tabs don't load Figma. */}
          {isActive && (
            <iframe
              key={component.figmaNodeId}
              title={`${component.figmaName} in Figma`}
              src={figmaUrl('https://embed.figma.com', component.figmaNodeId, { 'embed-host': 'rove-storybook' })}
              style={EMBED}
              allowFullScreen
            />
          )}
          <div style={{ padding: '8px 12px' }}>
            <Link href={figmaUrl(FILE.origin, component.figmaNodeId)} target="_blank" rel="noreferrer" withArrow>
              Open {component.figmaName} in Figma
            </Link>
          </div>
        </div>
      ) : (
        <EmptyTabContent
          title={component ? `${name} has no Figma component` : `${name} isn't in figma-components.json`}
          description={component?.whyNoFigmaComponent}
        />
      )}
    </AddonPanel>
  )
}

function figmaUrl(origin: string, node: string, params: Record<string, string> = {}): string {
  const url = new URL(FILE.pathname, origin)
  url.search = new URLSearchParams({ 'node-id': node.replace(':', '-'), ...params }).toString()
  return url.toString()
}
