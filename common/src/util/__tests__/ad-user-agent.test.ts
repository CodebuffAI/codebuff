import { describe, expect, test } from 'bun:test'

import { getAdUserAgent } from '../ad-user-agent'

describe('getAdUserAgent', () => {
  test.each([
    ['darwin', 'Macintosh; Intel Mac OS X'],
    ['win32', 'Windows NT 10.0'],
    ['linux', 'X11; Linux x86_64'],
  ])('returns a browser-like UA for %s', (platform, osFragment) => {
    const userAgent = getAdUserAgent(platform)

    expect(userAgent).toContain(osFragment)
    expect(userAgent).toContain('Chrome/')
    expect(userAgent).not.toStartWith('Bun/')
  })

  test('falls back to Linux for an unknown platform', () => {
    expect(getAdUserAgent('other')).toBe(getAdUserAgent('linux'))
  })

  test('accepts the device OS names used by the ads API', () => {
    expect(getAdUserAgent('macos')).toBe(getAdUserAgent('darwin'))
    expect(getAdUserAgent('windows')).toBe(getAdUserAgent('win32'))
  })
})
