export const APP_TABS = ['home', 'speed', 'interfaces', 'devices', 'usage', 'diagnostics'] as const

export type AppTab = (typeof APP_TABS)[number]
