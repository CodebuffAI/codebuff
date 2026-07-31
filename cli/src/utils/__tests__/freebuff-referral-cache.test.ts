import { beforeEach, describe, expect, test } from 'bun:test'

import {
  clearReferralCache,
  getCachedReferral,
  rememberReferral,
} from '../freebuff-referral-cache'

import type { FreebuffReferralInfo } from '@codebuff/common/types/freebuff-session'
import type { FreebuffSessionResponse } from '../../types/freebuff-session'

const referral: FreebuffReferralInfo = {
  code: 'ABC123',
  referrerName: null,
  qualifiedCount: 2,
  weeklySessionsRemaining: 1,
  resetAt: '2026-07-01T00:00:00.000Z',
  githubLinked: true,
}

const landingWithReferral = {
  status: 'none',
  accessTier: 'full',
  referral,
} satisfies FreebuffSessionResponse

const activeWithoutReferral = {
  status: 'active',
  accessTier: 'full',
  model: 'minimax/minimax-m3',
  instanceId: 'i-1',
  admittedAt: '2026-07-01T00:00:00.000Z',
  expiresAt: '2026-07-01T01:00:00.000Z',
  remainingMs: 3_600_000,
} satisfies FreebuffSessionResponse

describe('freebuff referral cache', () => {
  beforeEach(() => {
    clearReferralCache()
  })

  test('starts empty', () => {
    expect(getCachedReferral('full')).toBeUndefined()
  })

  test('remembers a referral block from a landing response', () => {
    rememberReferral(landingWithReferral)
    expect(getCachedReferral('full')).toEqual(referral)
  })

  test('keeps the last referral across a join → active round-trip', () => {
    // Simulates: land on picker (referral present) → join a model (server drops
    // referral from queued/active payloads). The cache must survive so
    // returning to the picker can still render the GLM banner.
    rememberReferral(landingWithReferral)
    rememberReferral(activeWithoutReferral)
    expect(getCachedReferral('full')).toEqual(referral)
  })

  test('ignores responses without a referral block', () => {
    rememberReferral(activeWithoutReferral)
    expect(getCachedReferral('full')).toBeUndefined()
  })

  test('an authoritative landing response clears stale referral metadata', () => {
    rememberReferral(landingWithReferral)
    rememberReferral({
      status: 'none',
      accessTier: 'full',
    })
    expect(getCachedReferral('full')).toBeUndefined()
  })

  test('ignores null sessions', () => {
    rememberReferral(landingWithReferral)
    rememberReferral(null)
    expect(getCachedReferral('full')).toEqual(referral)
  })

  test('does not reuse referral metadata across access tiers', () => {
    rememberReferral(landingWithReferral)
    expect(getCachedReferral('limited')).toBeUndefined()
  })

  test('retains independent referral metadata for both tiers', () => {
    const limitedReferral: FreebuffReferralInfo = {
      code: referral.code,
      referrerName: referral.referrerName,
      qualifiedCount: 3,
      githubLinked: referral.githubLinked,
    }
    rememberReferral(landingWithReferral)
    rememberReferral({
      status: 'none',
      accessTier: 'limited',
      referral: limitedReferral,
    })

    expect(getCachedReferral('full')).toEqual(referral)
    expect(getCachedReferral('limited')).toEqual(limitedReferral)
  })

  test('does not cache referral metadata without an access tier', () => {
    rememberReferral({
      status: 'none',
      referral,
    })
    expect(getCachedReferral('full')).toBeUndefined()
  })

  test('clears all account-scoped metadata on session-owner unmount', () => {
    rememberReferral(landingWithReferral)
    clearReferralCache()
    expect(getCachedReferral('full')).toBeUndefined()
  })
})
