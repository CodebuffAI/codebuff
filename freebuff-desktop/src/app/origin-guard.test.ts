import { describe, expect, test } from 'bun:test'

import { isAllowedApiOrigin, isLoopbackHostname } from './origin-guard'

describe('isLoopbackHostname', () => {
  test('accepts loopback hosts (incl. bracketed IPv6)', () => {
    expect(isLoopbackHostname('127.0.0.1')).toBe(true)
    expect(isLoopbackHostname('localhost')).toBe(true)
    expect(isLoopbackHostname('LOCALHOST')).toBe(true)
    expect(isLoopbackHostname('::1')).toBe(true)
    expect(isLoopbackHostname('[::1]')).toBe(true)
  })

  test('rejects non-loopback hosts', () => {
    expect(isLoopbackHostname('evil.com')).toBe(false)
    expect(isLoopbackHostname('127.0.0.1.evil.com')).toBe(false)
    expect(isLoopbackHostname('0.0.0.0')).toBe(false)
  })
})

describe('isAllowedApiOrigin', () => {
  test('allows absent Origin (same-origin / non-browser clients)', () => {
    expect(isAllowedApiOrigin(null)).toBe(true)
    expect(isAllowedApiOrigin(undefined)).toBe(true)
    expect(isAllowedApiOrigin('')).toBe(true)
  })

  test('allows loopback origins (renderer + dev Vite proxy)', () => {
    expect(isAllowedApiOrigin('http://127.0.0.1:8787')).toBe(true)
    expect(isAllowedApiOrigin('http://localhost:5173')).toBe(true)
    expect(isAllowedApiOrigin('http://[::1]:8787')).toBe(true)
  })

  test('rejects cross-origin and DNS-rebinding pages', () => {
    expect(isAllowedApiOrigin('https://evil.com')).toBe(false)
    expect(isAllowedApiOrigin('http://attacker.test')).toBe(false)
    // A subdomain that merely contains "127.0.0.1" is not loopback.
    expect(isAllowedApiOrigin('http://127.0.0.1.evil.com')).toBe(false)
    expect(isAllowedApiOrigin('not a url')).toBe(false)
  })
})
