import { flushSync } from 'react-dom'
import { IS_WEBKIT_GTK } from '@/lib/platform'
import { playThemeSwitchSound } from '@/app/utils/theme-sounds'

interface ViewTransition {
  ready: Promise<void>
  finished: Promise<void>
}

/** Book-keeping for a swap that's currently animating, so a fresh press can fold
 *  into it (reverse the clip) instead of starting a second, jumpy transition. */
interface RunningSwap {
  transition: ViewTransition
  /** The theme the clip circle is currently heading toward. */
  isTargetLight: boolean
  /** The clip animation — null until `transition.ready` resolves and it exists. */
  animation: Animation | null
}

// The swap animating right now (if any), so rapid presses can reverse it in
// place rather than stacking transitions. Module-level state is fine — there is
// only one document root to animate.
let running: RunningSwap | null = null

// Snappy: short and reacts fast off the click (minimal ease-in) with a clean
// deceleration out — no long lingering tail, which would crawl at the end and
// read as dragging.
const SWAP_DURATION_MS = 200
const SWAP_EASING = 'cubic-bezier(0.3, 0, 0.2, 1)'

function themeName(isLight: boolean): 'light' | 'dark' {
  return isLight ? 'light' : 'dark'
}

/**
 * Put the document in the light or dark theme, all at once. Buttons and rows
 * transition their colour and background for hover, and a theme flip would
 * otherwise play those too, so each control fades in after the page around it.
 * `theme-switching` (styles/base.css) turns transitions off while the new
 * colours are computed, and comes off once they're in place.
 */
export function applyThemeClass(isLight: boolean): void {
  const root = document.documentElement
  if (root.classList.contains('theme-light') === isLight) return
  root.classList.add('theme-switching')
  root.classList.toggle('theme-light', isLight)
  // Compute styles now, under `theme-switching`, so the colours land without a transition.
  void getComputedStyle(root).color
  void root.offsetHeight
  requestAnimationFrame(() => root.classList.remove('theme-switching'))
}

/**
 * Fold a press into the swap already animating rather than starting a second
 * transition on top of it (which snaps the first to its end and visibly jumps):
 * if it points the opposite way, reverse the clip circle from wherever it is
 * right now; if it points the same way, just keep the stored preference in sync.
 */
function foldIntoRunningSwap(swap: RunningSwap, isNextLight: boolean, persist: () => void): void {
  if (isNextLight !== swap.isTargetLight) {
    swap.isTargetLight = isNextLight
    // The snapshots cover the live DOM for the whole transition, so flipping
    // the class and re-rendering now is invisible until teardown — at which
    // point it must already match where the reversed circle lands.
    applyThemeClass(isNextLight)
    playThemeSwitchSound(themeName(isNextLight))
    // Reverse the clip in place. Before `ready` resolves the animation
    // doesn't exist yet; the ready handler reconciles direction on its own.
    swap.animation?.reverse()
  }
  persist()
}

/**
 * Drive the light snapshot's clip-path between a zero-radius circle and one
 * covering the whole window (radius = corner distance from centre).
 */
function animateClipCircle(root: HTMLElement, isNextLight: boolean): Animation {
  const endRadius = Math.hypot(window.innerWidth, window.innerHeight)
  const grow = [`circle(0px at 50% 50%)`, `circle(${endRadius}px at 50% 50%)`]
  return root.animate(
    {
      // Grow the incoming light circle outward; for dark, run the same
      // keyframes in reverse so the outgoing light circle shrinks inward.
      clipPath: isNextLight ? grow : [...grow].reverse(),
    },
    {
      duration: SWAP_DURATION_MS,
      easing: SWAP_EASING,
      // Hold the first and last frames. Without this the clip-path snaps
      // back to its base (a full, unclipped circle) when the animation
      // ends, so the collapsing light view reappears full-screen for one
      // frame before teardown — the flash of the old theme after the swap.
      fill: 'both',
      // To dark, animate the outgoing (light) snapshot as it collapses;
      // to light, animate the incoming (light) snapshot as it grows.
      pseudoElement: isNextLight ? '::view-transition-new(root)' : '::view-transition-old(root)',
    },
  )
}

/**
 * Flip the resolved theme with a circular reveal: the incoming theme grows as a
 * circle from the centre of the window rather than the browser's default
 * cross-fade. The View Transitions API snapshots the old and new states; we then
 * animate a clip circle over them (see `animateClipCircle`). Engines without
 * the API, WebKitGTK (where it's advertised but segfaults — see IS_WEBKIT_GTK),
 * and users who prefer reduced motion just get an instant swap — the state change
 * still applies, only the animation is skipped.
 *
 * `persist` stores the preference and re-renders React state; it always runs
 * exactly once, whether or not an animation plays.
 */
export function swapResolvedTheme(isNextLight: boolean, persist: () => void): void {
  const root = document.documentElement

  if (running) {
    foldIntoRunningSwap(running, isNextLight, persist)
    return
  }

  // No visible change (e.g. choosing 'system' on an OS that already matches the
  // current theme) — persist the preference without an animation or sound.
  if (isNextLight === root.classList.contains('theme-light')) {
    persist()
    return
  }

  // A little mechanical click on every visible flip, regardless of which swap
  // path (animated or instant) runs below.
  playThemeSwitchSound(themeName(isNextLight))

  const doc = document as Document & {
    startViewTransition?: (callback: () => void) => ViewTransition
  }
  const shouldReduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!doc.startViewTransition || shouldReduceMotion || IS_WEBKIT_GTK) {
    persist()
    return
  }

  // Direction is a mirror: dark→light grows the incoming light view outward
  // from the centre; light→dark plays the reverse, collapsing the outgoing
  // light view back to the centre to reveal dark beneath. The `theme-to-dark`
  // class tells styles/base.css which snapshot to stack on top; it's fixed for the
  // life of the transition, so a mid-flight reversal reuses it as-is.
  root.classList.toggle('theme-to-dark', !isNextLight)
  const transition = doc.startViewTransition(() => {
    // flushSync so the snapshot captures the fully re-rendered UI (including the
    // toggle's own sun/moon icon), and toggle the class here too so the new
    // snapshot definitely paints in the incoming theme's colours.
    flushSync(persist)
    applyThemeClass(isNextLight)
  })
  const swap: RunningSwap = { transition, isTargetLight: isNextLight, animation: null }
  running = swap

  transition.ready
    .then(() => {
      const animation = animateClipCircle(root, isNextLight)
      swap.animation = animation
      // If presses landed before the animation existed, the net direction may
      // already have flipped (an odd number of reversals) — start it reversed
      // so it lands on the current target rather than the original one.
      if (swap.isTargetLight !== isNextLight) animation.reverse()
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
