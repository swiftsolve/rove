// The manager builds with the classic JSX transform, so JSX needs React in scope.
import React, { type JSX } from 'react'
import { AddonPanel, EmptyTabContent, Link } from 'storybook/internal/components'
import { useStorybookApi, useStorybookState } from 'storybook/manager-api'

import type { ComponentListJson } from '../../../scripts/lib/library-json-types.ts'
import componentList from '../catalog/components.gen.json'

// A story's title ends in its component's name ('Containers/Card/CardHeader'),
// which is components.gen.json's key, so every story finds its Figma component
// with nothing set on the story itself.
const COMPONENTS: ComponentListJson['components'] = componentList.components
const FILE = new URL(componentList.figmaFileUrl)

const COLUMN: React.CSSProperties = { display: 'flex', flexDirection: 'column', height: '100%' }
const EMBED: React.CSSProperties = { flex: 1, width: '100%', border: 0 }

/** The Figma component beside the current story. */
export function FigmaPanel({ isActive }: { isActive: boolean }): JSX.Element {
  const api = useStorybookApi()
  // Re-renders the panel when the story changes.
  useStorybookState()
  const title = api.getCurrentStoryData()?.title ?? ''
  const name = title.split('/').at(-1) ?? ''
  const figmaComponent = COMPONENTS[name]?.figmaComponent

  return (
    <AddonPanel active={isActive}>
      {figmaComponent && 'figmaNodeId' in figmaComponent ? (
        <div style={COLUMN}>
          {/* Only while the tab is open, so other tabs don't load Figma. */}
          {isActive && (
            <iframe
              key={figmaComponent.figmaNodeId}
              title={`${figmaComponent.figmaName} in Figma`}
              src={figmaUrl('https://embed.figma.com', figmaComponent.figmaNodeId, { 'embed-host': 'rove-storybook' })}
              style={EMBED}
              allowFullScreen
            />
          )}
          <div style={{ padding: '8px 12px' }}>
            <Link href={figmaUrl(FILE.origin, figmaComponent.figmaNodeId)} target="_blank" rel="noreferrer" withArrow>
              Open {figmaComponent.figmaName} in Figma
            </Link>
          </div>
        </div>
      ) : (
        <EmptyTabContent
          title={figmaComponent ? `${name} has no Figma component` : `${name} isn't in components.gen.json`}
          description={figmaComponent?.whyNoFigmaComponent}
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
