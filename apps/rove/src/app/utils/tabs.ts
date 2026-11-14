/** Every tab, in nav-rail order: TabBar lists them as here. */
export const APP_TABS = [
  'home',
  'speed',
  'connection',
  'devices',
  'services',
  'apps',
  'usage',
  'events',
  'interfaces',
  'settings',
  'about',
] as const

export type AppTab = (typeof APP_TABS)[number]
