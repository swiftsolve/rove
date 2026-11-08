import { type CSSProperties, useEffect, useEffectEvent, useId, useRef } from 'react'

import { advanceFill } from '@/features/speed/utils/progress-fill'

// Material 3 wavy determinate progress, after Android's LinearWavyProgressIndicator.
// Drawn in measured pixels, not a stretched viewBox, so the wavelength holds and
// the caps stay round. Sizes are px, mirroring Android's dp defaults.
const WAVE_HEIGHT = 16
const WAVE_MID = WAVE_HEIGHT / 2
const WAVE_AMPLITUDE = 2.5
const WAVE_LENGTH = 40 // px per wave (Android LinearDeterminateWavelength = 40dp)
const WAVE_STROKE = 3 // active + track thickness
const WAVE_SPEED = 40 // px/second: Android moves the wave one wavelength per second
const WAVE_MIN_FRACTION = 0.03 // draw a small sliver even at 0% so the bar reads as live
const WAVE_SAMPLE_STEP = 3 // px between the points the squiggle path is built through
const TRACK_GAP = 4 // px gap between the active tip and the track (Android LinearIndicatorTrackGapSize = 4dp)
const LEAD_DOT_RADIUS = WAVE_STROKE + 2 // dot rides the leading edge of the wave
const MIN_REDRAW_PX = 0.25 // skip DOM writes for moves smaller than this
const MIN_TRACK_PX = 0.5 // hide the track once less than this is left of it

// Module scope so a tab switch mid-test resumes the bar where it had crept to.
// Tagged with its run, since a test started from Home begins while this is
// unmounted and must not resume the last run's full bar.
const persistedFill = { runId: 0, pct: 0 }

function waveY(x: number, phase: number): number {
  return WAVE_MID + WAVE_AMPLITUDE * Math.sin(((x + phase) / WAVE_LENGTH) * Math.PI * 2)
}

// Built once per width; the scroll is a CSS transform. One wavelength of
// overscan on the left keeps that scroll from exposing a gap.
function buildStaticWave(width: number): string {
  const start = -WAVE_LENGTH
  let prevX = start
  let prevY = waveY(start, 0)
  let path = `M ${prevX.toFixed(2)} ${prevY.toFixed(2)}`
  // Each sample is a control point and the curve ends midway to the next, so
  // the joins between curves stay smooth.
  for (let x = start + WAVE_SAMPLE_STEP; x <= width; x += WAVE_SAMPLE_STEP) {
    const y = waveY(x, 0)
    const midX = (prevX + x) / 2
    const midY = (prevY + y) / 2
    path += ` Q ${prevX.toFixed(2)} ${prevY.toFixed(2)} ${midX.toFixed(2)} ${midY.toFixed(2)}`
    prevX = x
    prevY = y
  }
  path += ` Q ${prevX.toFixed(2)} ${prevY.toFixed(2)} ${width.toFixed(2)} ${waveY(width, 0).toFixed(2)}`
  return path
}

export function WavyProgress({ progress, runId }: { progress: number; runId: number }) {
  const targetPct = Math.max(0, Math.min(100, progress))
  const readTarget = useEffectEvent(() => targetPct)

  // useId's colons are brittle inside an SVG url(#…) fragment reference.
  const clipId = `wavy${useId().replace(/:/g, '')}`
  const wrapperRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const wavePathRef = useRef<SVGPathElement>(null)
  const clipRef = useRef<SVGRectElement>(null)
  const dotRef = useRef<SVGCircleElement>(null)
  const trackRef = useRef<SVGLineElement>(null)

  // The scroll runs on the compositor (`animate-wavy-scroll`), so the path is
  // rebuilt only on resize, not every frame.
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    let width = wrapper.clientWidth
    const applySize = (): void => {
      const svg = svgRef.current
      const wavePath = wavePathRef.current
      if (svg && wavePath && width > 0) {
        svg.setAttribute('width', String(width))
        svg.setAttribute('viewBox', `0 0 ${width} ${WAVE_HEIGHT}`)
        wavePath.setAttribute('d', buildStaticWave(width))
      }
    }
    const measure = (): void => {
      width = wrapper.clientWidth
      applySize()
    }
    applySize()
    const observer = new ResizeObserver(measure)
    observer.observe(wrapper)

    // Each frame only grows the clip rect over the drawn wave and moves the dot.
    let fillPct = persistedFill.runId === runId ? persistedFill.pct : 0
    let lastFillEnd = -1
    let lastTrackStart = -1
    let frameId = 0

    const drawFill = (clip: SVGRectElement, dot: SVGCircleElement, track: SVGLineElement): void => {
      const fillEnd = Math.max(fillPct / 100, WAVE_MIN_FRACTION) * width
      // The creep is sub-pixel per frame, so most frames write nothing.
      if (Math.abs(fillEnd - lastFillEnd) < MIN_REDRAW_PX) return
      lastFillEnd = fillEnd
      clip.setAttribute('width', fillEnd.toFixed(2))
      dot.setAttribute('cx', fillEnd.toFixed(2))

      // Track runs to just inside the right edge (round cap unclipped),
      // starting a gap past the active tip.
      const trackEnd = width - WAVE_STROKE / 2
      const trackStart = Math.min(fillEnd + LEAD_DOT_RADIUS + TRACK_GAP, trackEnd)
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

  // The lead dot hides the clip rect's straight cut.
  return (
    <div ref={wrapperRef} className="block h-16 w-full leading-[0]" aria-hidden>
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
              ref={wavePathRef}
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
        <circle ref={dotRef} className="fill-accent" cy={WAVE_MID} r={LEAD_DOT_RADIUS} />
      </svg>
    </div>
  )
}
