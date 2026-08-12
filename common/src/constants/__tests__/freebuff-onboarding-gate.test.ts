import { describe, expect, it } from 'bun:test'

import {
  evaluateOnboardingRequirement,
  parseOnboardingCutover,
} from '../freebuff-onboarding-gate'

const CUTOVER = new Date('2026-08-12T00:00:00.000Z')
const BEFORE = new Date('2026-08-01T00:00:00.000Z')
const AFTER = new Date('2026-08-13T00:00:00.000Z')

describe('existing users are never affected', () => {
  it('never requires an account created before the cutover', () => {
    // The load-bearing case. ~203,000 accounts predate this feature; they never
    // saw the questions and must never be stopped by them.
    const result = evaluateOnboardingRequirement({
      accountCreatedAt: BEFORE,
      requiredAfter: CUTOVER,
      complete: false,
    })
    expect(result).toEqual({ required: false, reason: 'pre_existing_account' })
  })

  it('exempts an account created at the exact cutover instant minus a millisecond', () => {
    const result = evaluateOnboardingRequirement({
      accountCreatedAt: new Date(CUTOVER.getTime() - 1),
      requiredAfter: CUTOVER,
      complete: false,
    })
    expect(result.required).toBe(false)
  })

  it('requires an account created at the cutover instant itself', () => {
    const result = evaluateOnboardingRequirement({
      accountCreatedAt: CUTOVER,
      requiredAfter: CUTOVER,
      complete: false,
    })
    expect(result.required).toBe(true)
  })
})

describe('missing configuration disables the gate rather than applying it', () => {
  it('requires nobody when no cutover is set', () => {
    // Absence must not mean "everyone". The opposite convention already cost
    // this repo seven hours once; here it would lock out every user at once.
    const result = evaluateOnboardingRequirement({
      accountCreatedAt: AFTER,
      requiredAfter: null,
      complete: false,
    })
    expect(result).toEqual({ required: false, reason: 'gate_disabled' })
  })

  it('parses only a usable instant, and nulls everything else', () => {
    expect(parseOnboardingCutover('2026-08-12T00:00:00Z')?.toISOString()).toBe(
      '2026-08-12T00:00:00.000Z',
    )
    for (const bad of [undefined, null, '', '   ', 'next tuesday', 'yes']) {
      expect(parseOnboardingCutover(bad as string)).toBeNull()
    }
  })

  it('lets a user through when their account age is unreadable', () => {
    // Deliberately the opposite of the trust-tier convention, where unknown age
    // means `new`. There, unknown costs some headroom; here it would cost
    // access entirely, so the safe default flips.
    const result = evaluateOnboardingRequirement({
      accountCreatedAt: null,
      requiredAfter: CUTOVER,
      complete: false,
    })
    expect(result).toEqual({ required: false, reason: 'unknown_account_age' })
  })
})

describe('new users', () => {
  it('requires a post-cutover account that has not answered', () => {
    expect(
      evaluateOnboardingRequirement({
        accountCreatedAt: AFTER,
        requiredAfter: CUTOVER,
        complete: false,
      }),
    ).toEqual({ required: true })
  })

  it('stops requiring once they have answered', () => {
    expect(
      evaluateOnboardingRequirement({
        accountCreatedAt: AFTER,
        requiredAfter: CUTOVER,
        complete: true,
      }),
    ).toEqual({ required: false, reason: 'already_complete' })
  })
})
