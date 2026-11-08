import { FOCUSABLE_SELECTOR } from '@/utils/highlight'

/**
 * Where the user was on a screen when they opened another from it: the control
 * they pressed and how far the page was scrolled. It's saved on the screen's
 * history entry, so going back lands focus on that control again.
 */
export type ReturnPoint = {
  /** The opener's tag, name and text, to find it again in the re-rendered page. */
  signature: string
  /** Its place among the page's controls, for when its text changed meanwhile ("Updated 6 min ago"). */
  index: number
  tagName: string
  /** Whether its focus ring showed: a keyboard user's press, not a click. */
  isFocusVisible: boolean
  scrollTop: number
}

/** Whether a value read back from history is a whole return point: an entry can outlive the build that wrote it. */
export function isReturnPoint(value: unknown): value is ReturnPoint {
  if (value == null || typeof value !== 'object') return false
  const fields: Partial<Record<keyof ReturnPoint, unknown>> = value
  return (
    typeof fields.signature === 'string' &&
    typeof fields.index === 'number' &&
    typeof fields.tagName === 'string' &&
    typeof fields.isFocusVisible === 'boolean' &&
    typeof fields.scrollTop === 'number'
  )
}

function signatureOf(element: Element): string {
  return [element.tagName, element.getAttribute('aria-label') ?? '', element.textContent.trim()].join('|')
}

// The element a click is being dispatched to, until the event is over. A
// click doesn't focus a button in WebKit, so the opener can't be read from
// `document.activeElement` alone.
let clickedElement: Element | null = null

/** Remembers each click's target while its handlers run, for `captureReturnPoint`. */
export function trackClicks(): () => void {
  const onClick = (event: MouseEvent): void => {
    clickedElement = event.target instanceof Element ? event.target : null
    setTimeout(() => {
      clickedElement = null
    })
  }
  document.addEventListener('click', onClick, true)
  return () => document.removeEventListener('click', onClick, true)
}

/**
 * The return point for the screen being left, or null when what opened the
 * next one isn't a control on the page (the nav rail).
 */
export function captureReturnPoint(): ReturnPoint | null {
  const main = document.querySelector('main')
  const scroller = document.querySelector<HTMLElement>('[data-scroll-root]')
  if (!main || !scroller) return null
  const opener = clickedElement?.closest(FOCUSABLE_SELECTOR) ?? document.activeElement
  if (!(opener instanceof HTMLElement) || opener === main || !main.contains(opener)) return null
  return {
    signature: signatureOf(opener),
    index: Array.from(main.querySelectorAll(FOCUSABLE_SELECTOR)).indexOf(opener),
    tagName: opener.tagName,
    isFocusVisible: opener.matches(':focus-visible'),
    scrollTop: scroller.scrollTop,
  }
}

/**
 * The control a return point names: the same one by its text, the nearest to
 * its old place if several match, else the one in its old place.
 */
function findOpener(main: HTMLElement, point: ReturnPoint): HTMLElement | null {
  const controls = Array.from(main.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  let match: HTMLElement | null = null
  let matchDistance = Infinity
  for (const [index, control] of controls.entries()) {
    const distance = Math.abs(index - point.index)
    if (signatureOf(control) === point.signature && distance < matchDistance) {
      match = control
      matchDistance = distance
    }
  }
  const controlInOldPlace = controls[point.index]
  return match ?? (controlInOldPlace?.tagName === point.tagName ? controlInOldPlace : null)
}

/**
 * Scrolls back to where the page was and focuses the control, with its ring
 * only if it showed when pressed. Returns false when the control is gone.
 */
export function restoreReturnPoint(main: HTMLElement, scroller: HTMLElement, point: ReturnPoint): boolean {
  const opener = findOpener(main, point)
  if (!opener) return false
  scroller.scrollTo({ top: point.scrollTop })
  // The page may have grown or shrunk meanwhile: bring the control into view.
  // The scroller is moved directly, not with focus()'s own scroll, which would
  // also scroll a host page around the embedded demo (see scrollToTopAndFlash).
  const openerBox = opener.getBoundingClientRect()
  const scrollerBox = scroller.getBoundingClientRect()
  if (openerBox.top < scrollerBox.top) scroller.scrollTop -= scrollerBox.top - openerBox.top
  else if (openerBox.bottom > scrollerBox.bottom) scroller.scrollTop += openerBox.bottom - scrollerBox.bottom
  // `focusVisible` isn't in TypeScript's DOM types yet; where a browser
  // ignores it, its own heuristic picks whether the ring shows.
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the DOM names the option.
  const options: FocusOptions & { focusVisible: boolean } = { preventScroll: true, focusVisible: point.isFocusVisible }
  opener.focus(options)
  return true
}
