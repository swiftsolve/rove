import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void): () => void {
  // A resolution query matches only the ratio it names, so it changes once the
  // ratio does: display scaling, browser zoom, or a move to another monitor.
  // Each change re-subscribes for the new ratio.
  const query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** Screen pixels per CSS pixel, kept current as display scaling or zoom changes. */
export function useDevicePixelRatio(): number {
  return useSyncExternalStore(
    subscribe,
    () => window.devicePixelRatio,
    () => 1,
  )
}
