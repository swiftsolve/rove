import { createElement, type ReactElement } from 'react'

import * as Icons from './Icons'

// Every icon the library exports (the types are gone at runtime), by name, for
// a story's icon control, as Figma's Icon swap offers.
const ICON_COMPONENTS: Record<string, Icons.IconComponent> = Object.fromEntries(
  Object.entries(Icons)
    .filter((entry): entry is [string, Icons.IconComponent] => typeof entry[1] === 'function')
    .sort(([a], [b]) => a.localeCompare(b)),
)

/**
 * A story's starting icon, by its export name. A control keeps the picked
 * option's name and swaps in the icon at render, so the name is what lets the
 * control show it as picked; typed as the prop it fills.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the caller names the prop type it fills.
export function iconArg<T>(name: string): T {
  return name as T
}

/** The control for a prop that takes an icon component: `icon={PlayIcon}`. */
export const iconComponentControl = {
  control: 'select',
  options: Object.keys(ICON_COMPONENTS),
  mapping: ICON_COMPONENTS,
} as const

/**
 * The control for a prop that takes a drawn icon at `size`:
 * `icon={<PlayIcon size={18} />}`. `extra` adds icons from outside the set,
 * such as a DirectionIcon.
 */
export function iconElementControl(size: number, extra: Record<string, ReactElement> = {}) {
  const mapping: Record<string, ReactElement> = { ...extra }
  for (const [name, Icon] of Object.entries(ICON_COMPONENTS)) mapping[name] = createElement(Icon, { size })
  return { control: 'select', options: Object.keys(mapping), mapping } as const
}
