import { addons } from 'storybook/manager-api'
import { themes } from 'storybook/theming'

import designPackage from '../package.json'

// Keeps Storybook's own light or dark, following the system, as it does without a theme.
const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
const theme = isDark ? themes.dark : themes.light

// The Rove Mark (docs/assets/rove-mark.svg) in the accent, which names Rove,
// then Rove Tokens over the version. With no brandImage, Storybook renders brandTitle as HTML.
const brandTitle = `
  <span style="display:inline-flex;align-items:center;gap:10px">
    <svg width="32" height="32" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <circle cx="24" cy="24" r="7.5" fill="#5b8cff" />
      <path d="M 11.98 36.02 A 17 17 0 1 1 36.02 36.02" stroke="#5b8cff" stroke-width="5" stroke-linecap="round" />
    </svg>
    <span style="display:flex;flex-direction:column;line-height:1.2">
      <span style="font-size:18px;font-weight:600">Rove Tokens</span>
      <span style="font-size:12px;font-weight:400;color:${theme.textMutedColor}">v${designPackage.version}</span>
    </span>
  </span>
`

addons.setConfig({
  theme: { ...theme, brandTitle, brandImage: null },
  // The pages have no args, so the addon panel would only say so.
  layoutCustomisations: { showPanel: () => false },
})
