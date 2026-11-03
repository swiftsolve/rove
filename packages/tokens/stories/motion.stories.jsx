import { useState } from 'react'

import { Code, Name, Page, Section, Table, TableRow } from './blocks'
import { code, cssName, flatten, motion } from './tokens'

export default { title: 'Motion' }

// The curve on a 48px square, time across and progress up.
function Curve({ points: [x1, y1, x2, y2] }) {
  const at = (x, y) => `${4 + x * 40} ${44 - y * 40}`
  return (
    <svg className="curve" width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d={`M ${at(0, 0)} C ${at(x1, y1)} ${at(x2, y2)} ${at(1, 1)}`} stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

// A `linear()` curve, such as the spring's, on the same square: its stops are
// evenly spaced in time. DTCG has no type for it, so it's read from tokens.css.
function LinearCurve({ name }) {
  const css = getComputedStyle(document.documentElement).getPropertyValue(name)
  const stops = (/linear\(([^)]*)\)/.exec(css)?.[1] ?? '').split(',').map(Number)
  const at = (x, y) => `${4 + x * 40} ${44 - y * 40}`
  const path = stops.map((y, i) => `${i ? 'L' : 'M'} ${at(i / (stops.length - 1), y)}`).join(' ')
  return (
    <svg className="curve" width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d={path} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

const track = (transition) => (
  <span className="track">
    <span className="track-dot" style={{ transition: `left ${transition}` }} />
  </span>
)

function MotionPage() {
  const [isPlaying, setIsPlaying] = useState(false)
  const tokens = [...flatten(code), ...flatten(motion)]
  const easings = tokens.filter((token) => token.$type === 'cubicBezier')
  const durations = tokens.filter((token) => token.$type === 'duration')
  return (
    <Page title="Motion" intro="Ease out over a fast or normal duration. Resizing panels spring.">
      <button type="button" className="motion-play" onClick={() => setIsPlaying(!isPlaying)}>
        {isPlaying ? 'Reset' : 'Play'}
      </button>
      <div className={isPlaying ? 'is-playing' : undefined}>
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
              const name = cssName(token.path)
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
              const name = cssName(token.path)
              const ease = name === '--duration-spring' ? '--ease-spring' : '--ease-out'
              return (
                <TableRow key={name}>
                  <Name name={token.path.join('/')} />
                  <span className="mono">
                    {token.$value.value}
                    {token.$value.unit}
                  </span>
                  {track(`var(${name}) var(${ease})`)}
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
