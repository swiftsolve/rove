/** What takes focus: the selector for a control, shared with navigation's return point. */
export const FOCUSABLE = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Briefly ring an element just scrolled to after a navigation, and move focus
 * to it (or its own control) so the next Tab continues from there. Overrides
 * the focus-the-h1 on navigation, which runs first. Nothing to tear down: the
 * ring strips its own class when it ends.
 */
export function flashHighlight(el: HTMLElement): void {
  const target = el.matches(FOCUSABLE) ? el : el.querySelector<HTMLElement>(FOCUSABLE)
  if (target) {
    target.focus({ preventScroll: true })
  } else {
    el.tabIndex = -1
    el.focus({ preventScroll: true })
  }

  // Without the reflow, a second flash in a row coalesces and never replays.
  el.classList.remove('nav-flash')
  void el.offsetWidth
  el.classList.add('nav-flash')
  el.addEventListener('animationend', () => el.classList.remove('nav-flash'), { once: true })
}

/**
 * Scroll `el` to the top of the app's `[data-scroll-root]` (less its
 * scroll-margin-top), then flash it. Returns false, doing nothing, when it
 * isn't inside one.
 *
 * Not el.scrollIntoView(): that scrolls every scrollable ancestor, across an
 * iframe boundary too, so the marketing-site demo would drag its host page along.
 */
export function scrollToTopAndFlash(el: HTMLElement, behavior: ScrollBehavior = 'auto'): boolean {
  const scroller = el.closest<HTMLElement>('[data-scroll-root]')
  if (!scroller) return false
  const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0
  const offset = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top
  scroller.scrollTo({ top: scroller.scrollTop + offset - margin, behavior })
  flashHighlight(el)
  return true
}
