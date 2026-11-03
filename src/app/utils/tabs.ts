/** Every tab, in nav-rail order: TabBar lists them as here. */
export const APP_TABS = [
  'home',
  'speed',
  'devices',
  'apps',
  'services',
  'events',
  'interfaces',
  'diagnostics',
  'usage',
  'settings',
  'about',
] as const

export type AppTab = (typeof APP_TABS)[number]
