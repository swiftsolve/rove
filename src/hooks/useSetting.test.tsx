import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { getSetting, useSetting } from './useSetting'

function SoundToggle({ label }: { label: string }): JSX.Element {
  const [isOn, setIsOn] = useSetting('testSound', true)
  return (
    <button type="button" onClick={() => setIsOn(!isOn)}>
      {label}: {isOn ? 'on' : 'off'}
    </button>
  )
}

function NameReadout(): JSX.Element {
  const [name] = useSetting('testName', 'fallback')
  return <p>{name}</p>
}

describe('useSetting', () => {
  it('keeps two readers of one key in the same window in step', () => {
    render(
      <>
        <SoundToggle label="first" />
        <SoundToggle label="second" />
      </>,
    )
    act(() => screen.getByText('first: on').click())
    expect(screen.getByText('first: off')).toBeInTheDocument()
    expect(screen.getByText('second: off')).toBeInTheDocument()
    expect(window.localStorage.getItem('rove.setting.testSound')).toBe('false')
    expect(getSetting('testSound', true)).toBe(false)
  })

  it('reads a string setting, falling back when none is stored', () => {
    render(<NameReadout />)
    expect(screen.getByText('fallback')).toBeInTheDocument()
  })
})
