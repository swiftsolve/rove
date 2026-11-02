import { spring } from 'motion'

/**
 * The spring that moves and resizes panels, settling with a slight overshoot:
 * a dialog easing to its content's height. A CSS transition's duration and
 * easing (`linear()`), so it runs without JavaScript and reduced motion cuts
 * it short like any other transition: `transition: height ${SPRING}`.
 */
export const SPRING = spring(0.3, 0.15).toString()

/** The quicker, springier one for small changes like a hover lift: about half the visual time. */
export const SPRING_FAST = spring(0.15, 0.25).toString()
