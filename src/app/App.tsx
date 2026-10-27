import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/app/utils/query-client'
import { NavigationProvider } from '@/app/context/NavigationProvider'
import { ThemeProvider } from '@/app/context/ThemeProvider'
import { NetworkProvider } from '@/app/context/NetworkProvider'
// AppShell pulls in every view's stylesheet. The shared error classes load
// after it, so they win ties against a view's own rules.
import { AppShell } from '@/app/AppShell'
import '@/styles/feedback.css'

/** The app: shared state (query cache, navigation, theme, network) around the shell. */
export function App(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <NavigationProvider>
        <ThemeProvider>
          <NetworkProvider>
            <AppShell />
          </NetworkProvider>
        </ThemeProvider>
      </NavigationProvider>
    </QueryClientProvider>
  )
}
