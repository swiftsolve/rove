/** What takes focus: the selector for a control, shared with navigation's return point. */
export const FOCUSABLE_SELECTOR = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Briefly ring an element just scrolled to after a navigation, and move focus
 * to it (or its own control) so the next Tab continues from there. Overrides
 * the focus-the-h1 on navigation, which runs first. Nothing to tear down: the
 * ring strips its own class when it ends.
 */
export function flashHighlight(element: HTMLElement): void {
  const target = element.matches(FOCUSABLE_SELECTOR) ? element : element.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
  if (target) {
    target.focus({ preventScroll: true })
  } else {
    element.tabIndex = -1
    element.focus({ preventScroll: true })
  }

  // Without the reflow, a second flash in a row coalesces and never replays.
  element.classList.remove('nav-flash')
  void element.offsetWidth
  element.classList.add('nav-flash')
  element.addEventListener('animationend', () => element.classList.remove('nav-flash'), { once: true })
}

/**
 * Scroll `element` to the top of the app's `[data-scroll-root]` (less its
 * scroll-margin-top), then flash it. Returns false, doing nothing, when it
 * isn't inside one.
 *
 * Not element.scrollIntoView(): that scrolls every scrollable ancestor, across an
 * iframe boundary too, so the marketing-site demo would drag its host page along.
 */
export function scrollToTopAndFlash(element: HTMLElement, behavior: ScrollBehavior = 'auto'): boolean {
  const scroller = element.closest<HTMLElement>('[data-scroll-root]')
  if (!scroller) return false
  const margin = parseFloat(getComputedStyle(element).scrollMarginTop) || 0
  const offset = element.getBoundingClientRect().top - scroller.getBoundingClientRect().top
  scroller.scrollTo({ top: scroller.scrollTop + offset - margin, behavior })
  flashHighlight(element)
  return true
}
