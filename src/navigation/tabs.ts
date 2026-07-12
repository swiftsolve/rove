export const APP_TABS = [
  'home',
  'speed',
  'interfaces',
  'devices',
  'events',
  'usage',
  'diagnostics',
  'settings',
  'about',
] as const

export type AppTab = (typeof APP_TABS)[number]
