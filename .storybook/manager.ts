import typography from '@swiftsolve/rove-tokens/tokens/typography.tokens.json'
import { createElement } from 'react'
import { addons, types } from 'storybook/manager-api'
import { themes } from 'storybook/theming'

import { FigmaPanel } from './figma-panel'

// Storybook's own frame is dark, as the app is by default, whatever the system's setting.
const theme = themes.dark

// The sidebar runs in its own frame without tokens.css, so it takes the font
// stacks from the token files; manager-head.html loads the two faces.
// Family names are quoted; generic ones (system-ui, sans-serif) can't be.
const fontStack = (family: { $value: string[] }): string =>
  family.$value.map((name) => (/[A-Z ]/.test(name) ? `'${name}'` : name)).join(', ')
const SANS = fontStack(typography['font-family'].sans)
const DISPLAY = fontStack(typography['font-family'].display)

// The Rove Mark (BrandIcon's paths) in the accent, which names Rove, then
// Rove Components. With no brandImage, Storybook renders brandTitle as HTML.
const brandTitle = `
  <span style="display:inline-flex;align-items:center;gap:10px">
    <svg width="32" height="32" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <circle cx="24" cy="24" r="7.5" fill="#5b8cff" />
      <path d="M 11.98 36.02 A 17 17 0 1 1 36.02 36.02" stroke="#5b8cff" stroke-width="5" stroke-linecap="round" />
    </svg>
    <span style="font-family:${DISPLAY};font-size:18px;font-weight:700">Rove Components</span>
  </span>
`

addons.setConfig({
  theme: { ...theme, fontBase: SANS, brandTitle, brandImage: null },
})

// A Figma tab beside Controls: the story's component in the design file.
addons.register('rove/figma', () => {
  addons.add('rove/figma/panel', {
    type: types.PANEL,
    title: 'Figma',
    render: ({ active }) => createElement(FigmaPanel, { isActive: active ?? false }),
  })
})
