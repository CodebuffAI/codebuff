import { describe, expect, it } from 'bun:test'

import { isServableLandingUrl } from '../freebuff-ads'

describe('isServableLandingUrl', () => {
  it('accepts a bare domain once normalizeUrlInput adds the scheme', () => {
    expect(isServableLandingUrl('neon.tech')).toBe(true)
  })

  it('accepts a URL that already carries https', () => {
    expect(isServableLandingUrl('https://neon.tech/freebuff')).toBe(true)
  })

  it('rejects localhost, which parses fine but is not a public destination', () => {
    expect(isServableLandingUrl('localhost:3000/x')).toBe(false)
  })

  it('rejects a mailto link', () => {
    expect(isServableLandingUrl('mailto:a@b.c')).toBe(false)
  })

  it('rejects a javascript: URL', () => {
    expect(isServableLandingUrl('javascript:alert(1)')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(isServableLandingUrl('')).toBe(false)
  })

  it('rejects free text with spaces, which fails to parse even scheme-prepended', () => {
    expect(isServableLandingUrl('neon.tech is the fastest')).toBe(false)
  })
})
