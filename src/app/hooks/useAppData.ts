import { useContext } from 'react'
import { AppDataContext, type AppData } from '@/app/context/app-data-context'

/** The app's backend data: `network`, `internet`, `connection` and each screen's `screens` data. */
export function useAppData(): AppData {
  const data = useContext(AppDataContext)
  if (!data) throw new Error('useAppData must be used inside <AppDataProvider>')
  return data
}
