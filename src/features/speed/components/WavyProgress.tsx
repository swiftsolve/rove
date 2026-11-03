import { type CSSProperties, useEffect, useEffectEvent, useId, useRef } from 'react'

import { advanceFill } from '@/features/speed/utils/progress-fill'

// Material 3 "wavy" determinate progress, matching Android's LinearWavyProgressIndicator:
// a scrolling squiggle for the active portion with a dot riding its leading edge,
// a small gap, then a flat track for the remaining portion. Drawn in real
// pixels (the container width is measured) so it maps 1:1 — no aspect distortion,
// which keeps the wave's wavelength honest and the caps perfectly round. All
// dimensions below are in px, mirroring the Android dp defaults.
const WAVE_HEIGHT = 16
const WAVE_MID = WAVE_HEIGHT / 2
const WAVE_AMPLITUDE = 2.5
const WAVE_LENGTH = 40 // px per wave (Android LinearDeterminateWavelength = 40dp)
const WAVE_STROKE = 3 // active + track thickness
const WAVE_SPEED = 40 // px/second — Android moves the wave one wavelength per second
const WAVE_MIN_FRACTION = 0.03 // draw a small sliver even at 0% so the bar reads as live
const WAVE_SAMPLE_STEP = 3 // px between the points the squiggle path is built through
const TRACK_GAP = 4 // px gap between the active tip and the track (Android LinearIndicatorTrackGapSize = 4dp)
const LEAD_DOT_R = WAVE_STROKE + 2 // dot rides the leading edge of the wave
const MIN_REDRAW_PX = 0.25 // skip DOM writes for moves smaller than this
const MIN_TRACK_PX = 0.5 // hide the track once less than this is left of it

// The smoothed fill leads the backend's coarse steps, so it must outlive the
// component: switching tabs mid-test and coming back should resume the bar
// where it had crept to, not snap back to the last backend step. Kept at module
// scope (like the store's live-peak throughput) so it survives remounts, and
// tagged with its run: a test started from Home runs while this is unmounted,
// so the bar can't count on seeing it start, and must not resume the last run's
// full bar.
const persistedFill = { runId: 0, pct: 0 }

// Full amplitude throughout — the wave stays wavy from the start right up to the
// rounded cap at the leading edge, like Android's.
function waveY(x: number, phase: number): number {
  return WAVE_MID + WAVE_AMPLITUDE * Math.sin(((x + phase) / WAVE_LENGTH) * Math.PI * 2)
}

// Build the squiggle path ONCE per width: a smooth (quadratic through midpoints)
// wave spanning one wavelength of overscan on the left (so the CSS scroll can
// translate it rightward without exposing a gap) through the full width. Phase
// is fixed at 0 — the scroll is a CSS transform on the GPU, not a per-frame
// rebuild, so this string is only regenerated when the container resizes.
function buildStaticWave(width: number): string {
  const start = -WAVE_LENGTH
  let prevX = start
  let prevY = waveY(start, 0)
  let path = `M ${prevX.toFixed(2)} ${prevY.toFixed(2)}`
  for (let x = start + WAVE_SAMPLE_STEP; x <= width; x += WAVE_SAMPLE_STEP) {
    const y = waveY(x, 0)
    path += ` Q ${prevX.toFixed(2)} ${prevY.toFixed(2)} ${((prevX + x) / 2).toFixed(2)} ${((prevY + y) / 2).toFixed(2)}`
    prevX = x
    prevY = y
  }
  path += ` Q ${prevX.toFixed(2)} ${prevY.toFixed(2)} ${width.toFixed(2)} ${waveY(width, 0).toFixed(2)}`
  return path
}

export function WavyProgress({ progress, runId }: { progress: number; runId: number }) {
  const targetPct = Math.max(0, Math.min(100, progress))
  const readTarget = useEffectEvent(() => targetPct)

  // Sanitize the colons React's useId emits — they're fine in most contexts but
  // brittle inside an SVG url(#…) fragment reference.
  const clipId = `wavy${useId().replace(/:/g, '')}`
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const fillRef = useRef<SVGPathElement>(null)
  const clipRef = useRef<SVGRectElement>(null)
  const dotRef = useRef<SVGCircleElement>(null)
  const trackRef = useRef<SVGLineElement>(null)

  // The wave *shape* is fixed; only its horizontal offset scrolls, and that's a
  // CSS transform on the scroll group (compositor-driven — see `animate-wavy-scroll`
  // in styles/tailwind.css).
  // So the expensive work — building the squiggle `d` string and re-parsing it —
  // happens only when the width changes, here, not 60×/s. The per-frame loop
  // below is left with a couple of trivial attribute writes.
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    let width = wrap.clientWidth
    const applySize = (): void => {
      const svg = svgRef.current
      const fill = fillRef.current
      if (svg && fill && width > 0) {
        svg.setAttribute('width', String(width))
        svg.setAttribute('viewBox', `0 0 ${width} ${WAVE_HEIGHT}`)
        fill.setAttribute('d', buildStaticWave(width)) // rebuilt only on resize
      }
    }
    const measure = (): void => {
      width = wrap.clientWidth
      applySize()
    }
    applySize()
    const observer = new ResizeObserver(measure)
    observer.observe(wrap)

    // Per-frame work is just advancing the fill length: a clip rect grows to
    // reveal more of the (already-drawn, GPU-scrolled) wave, and the dot rides
    // its leading edge. No geometry is rebuilt, so the loop is nearly free.
    let fillPct = persistedFill.runId === runId ? persistedFill.pct : 0
    let lastFillEnd = -1
    let lastTrackStart = -1
    let frameId = 0

    const drawFill = (clip: SVGRectElement, dot: SVGCircleElement, track: SVGLineElement): void => {
      const fillEnd = Math.max(fillPct / 100, WAVE_MIN_FRACTION) * width
      // Skip the DOM writes on frames where the fill hasn't moved a pixel — the
      // creep is sub-pixel per frame, so most frames are no-ops.
      if (Math.abs(fillEnd - lastFillEnd) < MIN_REDRAW_PX) return
      lastFillEnd = fillEnd
      clip.setAttribute('width', fillEnd.toFixed(2))
      dot.setAttribute('cx', fillEnd.toFixed(2))

      // Track runs to just inside the right edge (round cap unclipped),
      // starting a gap past the active tip.
      const trackEnd = width - WAVE_STROKE / 2
      const trackStart = Math.min(fillEnd + LEAD_DOT_R + TRACK_GAP, trackEnd)
      if (Math.abs(trackStart - lastTrackStart) < MIN_REDRAW_PX) return
      lastTrackStart = trackStart
      if (trackEnd - trackStart > MIN_TRACK_PX) {
        track.setAttribute('x1', trackStart.toFixed(2))
        track.setAttribute('x2', trackEnd.toFixed(2))
        track.style.display = ''
      } else {
        track.style.display = 'none'
      }
    }

    const loop = (): void => {
      fillPct = advanceFill(fillPct, readTarget())
      // survive a remount mid-test
      persistedFill.runId = runId
      persistedFill.pct = fillPct

      const clip = clipRef.current
      const dot = dotRef.current
      const track = trackRef.current
      if (width > 0 && clip && dot && track) drawFill(clip, dot, track)
      frameId = requestAnimationFrame(loop)
    }
    frameId = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(frameId)
      observer.disconnect()
    }
  }, [runId])

  // Static shell. The wave is drawn once and scrolls via CSS; a clip rect (grown
  // by the loop) reveals the filled portion; the dot rides its leading edge and
  // masks the clip's straight cut. The dot stays on the centerline, so cy is fixed.
  return (
    <div ref={wrapRef} className="block h-16 w-full leading-[0]" aria-hidden>
      <svg ref={svgRef} height={WAVE_HEIGHT}>
        <defs>
          <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
            <rect ref={clipRef} x={0} y={0} width={0} height={WAVE_HEIGHT} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <g
            className="animate-wavy-scroll will-change-transform motion-reduce:animate-none"
            style={
              {
                '--wave-length': `${WAVE_LENGTH}px`,
                animationDuration: `${WAVE_LENGTH / WAVE_SPEED}s`,
              } as CSSProperties
            }
          >
            <path
              ref={fillRef}
              className="fill-none stroke-accent stroke-3 [stroke-linecap:round] [stroke-linejoin:round]"
            />
          </g>
        </g>
        {/* The remaining portion: the same accent, dimmed, as Android draws the
            track at reduced emphasis behind the active indicator. */}
        <line
          ref={trackRef}
          className="stroke-accent stroke-3 opacity-24 [stroke-linecap:round]"
          y1={WAVE_MID}
          y2={WAVE_MID}
          style={{ display: 'none' }}
        />
        <circle ref={dotRef} className="fill-accent" cy={WAVE_MID} r={LEAD_DOT_R} />
      </svg>
    </div>
  )
}
