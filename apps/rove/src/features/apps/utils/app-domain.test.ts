import { describe, expect, it } from 'vitest'

import { appDomain } from './app-domain'

describe('appDomain', () => {
  it('finds a brand among the words of a process name', () => {
    expect(appDomain('Google Chrome Helper (Renderer)')).toBe('google.com')
    expect(appDomain('com.apple.WebKit.Networking')).toBe('apple.com')
    expect(appDomain('Code Helper')).toBe('visualstudio.com')
    expect(appDomain('git-remote-https')).toBe('github.com')
    expect(appDomain('msedge.exe')).toBe('microsoft.com')
  })

  it('never matches a brand inside another word', () => {
    expect(appDomain('Xcode')).toBe('')
    expect(appDomain('codesign')).toBe('')
    expect(appDomain('legit-daemon')).toBe('')
    expect(appDomain('knowledge-agent')).toBe('')
  })
})
