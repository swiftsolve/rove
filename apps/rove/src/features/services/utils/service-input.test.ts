import { describe, expect, it } from 'vitest'

import { parseServiceInput } from '@/features/services/utils/service-input'

describe('parseServiceInput', () => {
  it('takes the host from a URL and names it by its registrable label', () => {
    expect(parseServiceInput('https://api.github.com/x')).toEqual({ name: 'Github', host: 'api.github.com' })
    expect(parseServiceInput('  Zoom.us ')).toEqual({ name: 'Zoom', host: 'zoom.us' })
  })

  it('keeps an IP as its own name and drops the port', () => {
    expect(parseServiceInput('192.168.1.1:8080')).toEqual({ name: '192.168.1.1', host: '192.168.1.1' })
  })

  it('rejects input with nothing host-shaped', () => {
    expect(parseServiceInput('')).toBeNull()
    expect(parseServiceInput('not a host')).toBeNull()
    expect(parseServiceInput('localhost')).toBeNull()
    expect(parseServiceInput('300.1.1.1')).toBeNull()
  })
})
