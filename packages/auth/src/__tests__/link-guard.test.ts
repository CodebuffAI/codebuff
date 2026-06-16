import { describe, expect, it } from 'bun:test'

import {
  appendErrorParam,
  decideExplicitLink,
  isUnverifiedGoogleEmail,
} from '../link-guard'

describe('isUnverifiedGoogleEmail (Google verified-email gate)', () => {
  it('rejects Google when email_verified is false', () => {
    expect(
      isUnverifiedGoogleEmail({ provider: 'google', emailVerified: false }),
    ).toBe(true)
  })

  it('rejects Google when email_verified is missing/undefined', () => {
    expect(
      isUnverifiedGoogleEmail({ provider: 'google', emailVerified: undefined }),
    ).toBe(true)
  })

  it('rejects Google when email_verified is a non-boolean truthy value', () => {
    // Defense-in-depth: only a literal `true` is accepted.
    expect(
      isUnverifiedGoogleEmail({ provider: 'google', emailVerified: 'true' }),
    ).toBe(true)
  })

  it('allows Google when email_verified is exactly true', () => {
    expect(
      isUnverifiedGoogleEmail({ provider: 'google', emailVerified: true }),
    ).toBe(false)
  })

  it('never rejects non-Google providers (GitHub emails are provider-verified)', () => {
    expect(
      isUnverifiedGoogleEmail({ provider: 'github', emailVerified: undefined }),
    ).toBe(false)
    expect(
      isUnverifiedGoogleEmail({ provider: 'github', emailVerified: false }),
    ).toBe(false)
  })
})

describe('decideExplicitLink (explicit-link fork guard)', () => {
  const returnPath = '/profile?tab=connections'

  it('allows when the provider account is already linked (returning user)', () => {
    expect(
      decideExplicitLink({
        accountExists: true,
        emailUserExists: false,
        returnPath,
      }),
    ).toBe(true)
  })

  it('allows when an existing user owns the verified email (will auto-link)', () => {
    expect(
      decideExplicitLink({
        accountExists: false,
        emailUserExists: true,
        returnPath,
      }),
    ).toBe(true)
  })

  it('blocks when it would fork a brand-new account, returning an error redirect', () => {
    expect(
      decideExplicitLink({
        accountExists: false,
        emailUserExists: false,
        returnPath,
      }),
    ).toBe('/profile?tab=connections&error=link_no_match')
  })

  it('uses ? as the separator when the return path has no query string', () => {
    expect(
      decideExplicitLink({
        accountExists: false,
        emailUserExists: false,
        returnPath: '/account',
      }),
    ).toBe('/account?error=link_no_match')
  })
})

describe('appendErrorParam', () => {
  it('uses ? for a path without a query', () => {
    expect(appendErrorParam('/a', 'x')).toBe('/a?error=x')
  })

  it('uses & for a path that already has a query', () => {
    expect(appendErrorParam('/a?b=1', 'x')).toBe('/a?b=1&error=x')
  })
})
