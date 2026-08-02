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

  it('flags the 2026-08-01 free-mode compute ring domains and their subdomains', () => {
    // Real addresses from the ring; the deceptive subdomains are the point.
    expect(classifyEmailDomain('tbcy8kvy77z2@l0veyou.com')).toBe('disposable')
    expect(classifyEmailDomain('xtikhozbrw3z@gmail.l0veyou.com')).toBe('disposable')
    expect(classifyEmailDomain('kznc3jb31lsz@edu.l0veyou.com')).toBe('disposable')
    expect(classifyEmailDomain('ht07lgr96jsg@my.l0veyou.com')).toBe('disposable')
    expect(classifyEmailDomain('8cuoyn573zae@test123.l0veyou.com')).toBe('disposable')
    expect(classifyEmailDomain('4j4fyacbke76@pumpkinai.space')).toBe('disposable')
    expect(classifyEmailDomain('uhm9e3za1qft@gmail.pumpkinai.space')).toBe('disposable')
    expect(classifyEmailDomain('7yahsqv1o8lc@pumpkinai.it.com')).toBe('disposable')
  })

  it('does not flag lookalikes of the ring domains', () => {
    expect(classifyEmailDomain('x@loveyou.com')).toBeNull()
    expect(classifyEmailDomain('x@notl0veyou.com')).toBeNull()
    expect(classifyEmailDomain('x@pumpkinai.com')).toBeNull()
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
