// In nav-rail order: TabBar lists the tabs in this order.
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
