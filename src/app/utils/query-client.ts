import { focusManager, MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'

// Pause polls while the window is hidden and read once when it's shown, on the
// `visibilitychange` listener `usePageVisible` uses (on the document), so
// TanStack's polls and the app's own pause and resume on the same event.
focusManager.setEventListener((handleFocus) => {
  const onVisibilityChange = (): void => handleFocus()
  document.addEventListener('visibilitychange', onVisibilityChange)
  return () => document.removeEventListener('visibilitychange', onVisibilityChange)
})

/**
 * The app's one query cache. Each feature hook decides when its own query
 * fetches and polls; these defaults only switch off TanStack behaviour the app
 * never had.
 */
export const queryClient = new QueryClient({
  // A screen shows a failure as text; the log keeps what failed and why.
  queryCache: new QueryCache({ onError: (error, query) => console.warn('Query failed:', query.queryKey, error) }),
  mutationCache: new MutationCache({ onError: (error) => console.warn('Mutation failed:', error) }),
  defaultOptions: {
    queries: {
      // A failed read shows its error straight away; the next poll or reload is the retry.
      retry: false,
      // Keep results for the app's lifetime, so a screen you return to shows its
      // last result at once while it refreshes.
      gcTime: Infinity,
      // Window focus and reconnect refetch nothing unless a query asks for it.
      // Polled queries ask, to read once when the window is shown again.
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      // Every read goes to the local backend, not the internet. With the default
      // 'online' mode, TanStack would pause queries while the machine is offline,
      // which is exactly when a network monitor matters most.
      networkMode: 'always',
    },
  },
})
