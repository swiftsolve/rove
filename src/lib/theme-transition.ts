import { flushSync } from 'react-dom'
import { IS_WEBKIT_GTK } from '@/lib/platform'
import { playThemeSwitchSound } from '@/lib/theme-sounds'

interface ViewTransition {
  readonly ready: Promise<void>
  readonly finished: Promise<void>
}

/** Book-keeping for a swap that's currently animating, so a fresh press can fold
 *  into it (reverse the clip) instead of starting a second, jumpy transition. */
interface RunningSwap {
  readonly transition: ViewTransition
  /** The theme the clip circle is currently heading toward. */
  targetLight: boolean
  /** The clip animation — null until `transition.ready` resolves and it exists. */
  animation: Animation | null
}

// The swap animating right now (if any), so rapid presses can reverse it in
// place rather than stacking transitions. Module-level state is fine — there is
// only one document root to animate.
let running: RunningSwap | null = null

/**
 * Flip the resolved theme with a circular reveal: the incoming theme grows as a
 * circle from the centre of the window rather than the browser's default
 * cross-fade. The View Transitions API snapshots the old and new states; we then
 * drive the new snapshot's clip-path from a zero-radius circle out to one that
 * covers the whole window (radius = corner distance from centre). Engines without
 * the API, WebKitGTK (where it's advertised but segfaults — see IS_WEBKIT_GTK),
 * and users who prefer reduced motion just get an instant swap — the state change
 * still applies, only the animation is skipped.
 *
 * `persist` stores the preference and re-renders React state; it always runs
 * exactly once, whether or not an animation plays.
 */
export function swapResolvedTheme(nextLight: boolean, persist: () => void): void {
  const root = document.documentElement

  // A swap is already animating. Rather than starting a second transition on
  // top of it (which snaps the first to its end and visibly jumps), fold this
  // press into the running one: if it points the opposite way, reverse the clip
  // circle from wherever it is right now; if it points the same way, just keep
  // the stored preference in sync.
  if (running) {
    if (nextLight !== running.targetLight) {
      running.targetLight = nextLight
      // The snapshots cover the live DOM for the whole transition, so flipping
      // the class and re-rendering now is invisible until teardown — at which
      // point it must already match where the reversed circle lands.
      root.classList.toggle('theme-light', nextLight)
      playThemeSwitchSound(nextLight ? 'light' : 'dark')
      // Reverse the clip in place. Before `ready` resolves the animation
      // doesn't exist yet; the ready handler reconciles direction on its own.
      running.animation?.reverse()
    }
    persist()
    return
  }

  // No visible change (e.g. choosing 'system' on an OS that already matches the
  // current theme) — persist the preference without an animation or sound.
  if (nextLight === root.classList.contains('theme-light')) {
    persist()
    return
  }

  // A little mechanical click on every visible flip, regardless of which swap
  // path (animated or instant) runs below.
  playThemeSwitchSound(nextLight ? 'light' : 'dark')

  const doc = document as Document & {
    startViewTransition?: (callback: () => void) => ViewTransition
  }
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!doc.startViewTransition || reduceMotion || IS_WEBKIT_GTK) {
    persist()
    return
  }

  // Direction is a mirror: dark→light grows the incoming light view outward
  // from the centre; light→dark plays the reverse, collapsing the outgoing
  // light view back to the centre to reveal dark beneath. The `theme-to-dark`
  // class tells index.css which snapshot to stack on top; it's fixed for the
  // life of the transition, so a mid-flight reversal reuses it as-is.
  root.classList.toggle('theme-to-dark', !nextLight)
  const transition = doc.startViewTransition(() => {
    // flushSync so the snapshot captures the fully re-rendered UI (including the
    // toggle's own sun/moon icon), and toggle the class here too so the new
    // snapshot definitely paints in the incoming theme's colours.
    flushSync(persist)
    root.classList.toggle('theme-light', nextLight)
  })
  const swap: RunningSwap = { transition, targetLight: nextLight, animation: null }
  running = swap

  transition.ready
    .then(() => {
      const endRadius = Math.hypot(window.innerWidth, window.innerHeight)
      const grow = [`circle(0px at 50% 50%)`, `circle(${endRadius}px at 50% 50%)`]
      const animation = root.animate(
        {
          // Grow the incoming light circle outward; for dark, run the same
          // keyframes in reverse so the outgoing light circle shrinks inward.
          clipPath: nextLight ? grow : [...grow].reverse(),
        },
        {
          // Snappy: short and reacts fast off the click (minimal ease-in) with
          // a clean deceleration out — no long lingering tail, which would
          // crawl at the end and read as dragging.
          duration: 200,
          easing: 'cubic-bezier(0.3, 0, 0.2, 1)',
          // Hold the first and last frames. Without this the clip-path snaps
          // back to its base (a full, unclipped circle) when the animation
          // ends, so the collapsing light view reappears full-screen for one
          // frame before teardown — the flash of the old theme after the swap.
          fill: 'both',
          // To dark, animate the outgoing (light) snapshot as it collapses;
          // to light, animate the incoming (light) snapshot as it grows.
          pseudoElement: nextLight ? '::view-transition-new(root)' : '::view-transition-old(root)',
        },
      )
      swap.animation = animation
      // If presses landed before the animation existed, the net direction may
      // already have flipped (an odd number of reversals) — start it reversed
      // so it lands on the current target rather than the original one.
      if (swap.targetLight !== nextLight) animation.reverse()
    })
    // If the browser skips the transition, `ready` rejects — the theme has
    // already swapped, so there's nothing to do but avoid an unhandled rejection.
    .catch(() => {})

  // Once the swap settles (or is skipped), drop the direction flag and free the
  // slot so the next press starts a fresh transition.
  transition.finished.finally(() => {
    root.classList.remove('theme-to-dark')
    if (running === swap) running = null
  })
}
