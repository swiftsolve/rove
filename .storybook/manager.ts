import { addons } from 'storybook/manager-api'
import { themes } from 'storybook/theming'

// The Rove Mark (BrandIcon's paths) in the accent, then the name. With no
// brandImage, Storybook renders brandTitle as HTML.
const brandTitle = `
  <span style="display:inline-flex;align-items:center;gap:8px">
    <svg width="22" height="22" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <circle cx="24" cy="24" r="7.5" fill="#5b8cff" />
      <path d="M 11.98 36.02 A 17 17 0 1 1 36.02 36.02" stroke="#5b8cff" stroke-width="5" stroke-linecap="round" />
    </svg>
    <span style="font-size:17px;font-weight:600">Rove</span>
  </span>
`

// Keeps Storybook's own light or dark, following the system, as it does without a theme.
const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches

addons.setConfig({
  theme: { ...(isDark ? themes.dark : themes.light), brandTitle, brandImage: null },
})
