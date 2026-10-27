import { NavigationProvider } from '@/app/context/NavigationProvider'
import { ThemeProvider } from '@/app/context/ThemeProvider'
import { AppDataProvider } from '@/app/context/AppDataProvider'
// AppShell pulls in every view's stylesheet. The shared button and error
// classes load after it, so they win ties against a view's own rules.
import { AppShell } from '@/app/AppShell'
import '@/styles/buttons.css'
import '@/styles/feedback.css'

/** The app: shared state (navigation, theme, backend data) around the shell. */
export function App(): JSX.Element {
  return (
    <NavigationProvider>
      <ThemeProvider>
        <AppDataProvider>
          <AppShell />
        </AppDataProvider>
      </ThemeProvider>
    </NavigationProvider>
  )
}
