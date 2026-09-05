import { describe, expect, test } from 'bun:test'

import { getAdUserAgent, resolveGravityUserAgent } from '../ad-user-agent'

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

describe('resolveGravityUserAgent', () => {
  test.each([
    ['Freebuff-CLI/0.0.140', 'Freebuff-CLI/0.0.140'],
    ['  Freebuff-CLI/0.0.140 ', 'Freebuff-CLI/0.0.140'],
    ['Bun/1.3.11', 'Bun/1.3.11'],
    ['', 'Mozilla/5.0 fallback'],
    ['   ', 'Mozilla/5.0 fallback'],
    [undefined, 'Mozilla/5.0 fallback'],
  ])('header %j resolves to %s', (requestHeader, expected) => {
    expect(
      resolveGravityUserAgent({
        requestHeader,
        fallback: 'Mozilla/5.0 fallback',
      }),
    ).toBe(expected)
  })
})
