import './motion.css'

import { useEffect, useState } from 'react'

import { Code, Name, Page, Section, Table, TableRow } from './blocks'
import { cssVariableName, flatten, motion } from './tokens'

export default { title: 'Motion' }

// A point on the curve's 48px square, from time (0 to 1, across) and
// progress (0 to 1, up), inside a 4px margin.
const curvePoint = (time, progress) => `${4 + time * 40} ${44 - progress * 40}`

// A cubic-bezier curve, from its two control points.
function Curve({ points: [x1, y1, x2, y2] }) {
  return (
    <svg className="curve" width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path
        d={`M ${curvePoint(0, 0)} C ${curvePoint(x1, y1)} ${curvePoint(x2, y2)} ${curvePoint(1, 1)}`}
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  )
}

// A `linear()` curve, such as the spring's, on the same square: its stops are
// evenly spaced in time. DTCG has no spring, so it's read from tokens.css.
function LinearCurve({ name }) {
  const easingValue = getComputedStyle(document.documentElement).getPropertyValue(name)
  const stopList = /linear\(([^)]*)\)/.exec(easingValue)?.[1] ?? ''
  const stops = stopList.split(',').map(Number)
  const path = stops
    .map((progress, i) => {
      const command = i === 0 ? 'M' : 'L'
      return `${command} ${curvePoint(i / (stops.length - 1), progress)}`
    })
    .join(' ')
  return (
    <svg className="curve" width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d={path} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

// A dot that crosses its track with `transition` when the page flips is-at-end.
const track = (transition) => (
  <span className="track">
    <span className="track-dot" style={{ transition: `left ${transition}` }} />
  </span>
)

// While playing, the dots cross every LOOP_MS: longer than the slowest move (the
// spring's 450ms), so each one rests at the end before it heads back.
const LOOP_MS = 1100

// The button's icon, as Rove's line icons draw it.
function PlayIcon({ isPlaying }) {
  return (
    <svg className="motion-play-icon" viewBox="0 0 24 24" aria-hidden="true">
      {isPlaying ? (
        <>
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </>
      ) : (
        <path d="M7 5.5v13a1 1 0 0 0 1.52.85l10.4-6.5a1 1 0 0 0 0-1.7L8.52 4.65A1 1 0 0 0 7 5.5Z" />
      )}
    </svg>
  )
}

function MotionPage() {
  const [isPlaying, setIsPlaying] = useState(false)
  // Which end the dots head for. Pausing stops the loop; each dot finishes its move.
  const [isAtEnd, setIsAtEnd] = useState(false)
  useEffect(() => {
    if (!isPlaying) return undefined
    const timer = setInterval(() => setIsAtEnd((wasAtEnd) => !wasAtEnd), LOOP_MS)
    return () => clearInterval(timer)
  }, [isPlaying])
  // Play sets off the first move at once; the loop takes it from there.
  const onPlayClick = () => {
    if (!isPlaying) setIsAtEnd((wasAtEnd) => !wasAtEnd)
    setIsPlaying(!isPlaying)
  }
  const tokens = flatten(motion)
  const easings = tokens.filter((token) => token.$type === 'cubicBezier')
  const durations = tokens.filter((token) => token.$type === 'duration')
  return (
    <Page title="Motion" intro="Ease out over a fast or normal duration. Resizing panels spring.">
      <button type="button" className="motion-play" aria-pressed={isPlaying} onClick={onPlayClick}>
        <PlayIcon isPlaying={isPlaying} />
        {isPlaying ? 'Pause' : 'Play'}
      </button>
      <div className={isAtEnd ? 'is-at-end' : undefined}>
        <Section title="Easing" intro="Each over the normal duration; the spring over its own.">
          <Table
            columns={[
              ['Token', '1fr'],
              ['Curve', '0.5fr'],
              ['Preview', '2.4fr'],
              ['Code', 'minmax(150px, 1fr)'],
            ]}
          >
            {easings.map((token) => {
              const name = cssVariableName(token.path)
              return (
                <TableRow key={name}>
                  <Name name={token.path.join('/')} />
                  <Curve points={token.$value} />
                  {track(`var(--duration-normal) var(${name})`)}
                  <Code>var({name})</Code>
                </TableRow>
              )
            })}
            <TableRow>
              <Name name="ease/spring" />
              <LinearCurve name="--ease-spring" />
              {track('var(--duration-spring) var(--ease-spring)')}
              <Code>var(--ease-spring)</Code>
            </TableRow>
          </Table>
        </Section>
        <Section title="Duration" intro="Each with ease out; the spring's with its own curve.">
          <Table
            columns={[
              ['Token', '1fr'],
              ['Value', '0.5fr'],
              ['Preview', '2.4fr'],
              ['Code', 'minmax(150px, 1fr)'],
            ]}
          >
            {durations.map((token) => {
              const name = cssVariableName(token.path)
              const easeName = name === '--duration-spring' ? '--ease-spring' : '--ease-out'
              return (
                <TableRow key={name}>
                  <Name name={token.path.join('/')} />
                  <span className="mono">
                    {token.$value.value}
                    {token.$value.unit}
                  </span>
                  {track(`var(${name}) var(${easeName})`)}
                  <Code>var({name})</Code>
                </TableRow>
              )
            })}
          </Table>
        </Section>
      </div>
    </Page>
  )
}

export const Motion = { render: () => <MotionPage /> }
