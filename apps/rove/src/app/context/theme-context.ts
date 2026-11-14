import { createContext } from 'react'

import type { Theme } from '@/app/hooks/useThemeState'

export const ThemeContext = createContext<Theme | null>(null)
