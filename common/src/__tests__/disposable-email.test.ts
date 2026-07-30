import { describe, expect, it } from 'bun:test'

import { classifyEmailDomain } from '../util/disposable-email'

describe('classifyEmailDomain', () => {
  it('flags one-time inbox providers as disposable', () => {
    expect(classifyEmailDomain('bot123@mailinator.com')).toBe('disposable')
    expect(classifyEmailDomain('x@yopmail.com')).toBe('disposable')
    // Domains observed in the 2026-07 referral farm rings.
    expect(classifyEmailDomain('mrz640mq54kr@animatimg.com')).toBe(
      'disposable',
    )
    expect(classifyEmailDomain('a@biscoito.email')).toBe('disposable')
  })

  it('flags privacy relays separately (corroborating signal only)', () => {
    expect(classifyEmailDomain('4q9cq4d7cj@proton.me')).toBe('privacy_relay')
    expect(classifyEmailDomain('someone@protonmail.com')).toBe('privacy_relay')
    expect(classifyEmailDomain('g862jxscfv@privaterelay.appleid.com')).toBe(
      'privacy_relay',
    )
    expect(classifyEmailDomain('dev@pm.me')).toBe('privacy_relay')
  })

  it('matches subdomains of listed domains', () => {
    expect(classifyEmailDomain('x@inbox.mailinator.com')).toBe('disposable')
  })

  it('treats ordinary providers as unflagged', () => {
    expect(classifyEmailDomain('person@gmail.com')).toBeNull()
    expect(classifyEmailDomain('dev@company.io')).toBeNull()
    // Substring lookalikes must not match the suffix rule.
    expect(classifyEmailDomain('x@notproton.me.example.com')).toBeNull()
    expect(classifyEmailDomain('x@fakeproton.me')).toBeNull()
  })

  it('is case-insensitive and null-safe', () => {
    expect(classifyEmailDomain('X@Proton.ME')).toBe('privacy_relay')
    expect(classifyEmailDomain(null)).toBeNull()
    expect(classifyEmailDomain(undefined)).toBeNull()
    expect(classifyEmailDomain('not-an-email')).toBeNull()
    expect(classifyEmailDomain('trailing@')).toBeNull()
  })
})
