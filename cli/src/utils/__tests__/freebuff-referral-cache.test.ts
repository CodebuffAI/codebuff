import { beforeEach, describe, expect, test } from 'bun:test'

import {
  __resetReferralCacheForTest,
  getCachedReferral,
  rememberReferral,
} from '../codebirds-referral-cache'

import type { FreebuffReferralInfo } from '@codebirds/common/types/codebirds-session'
import type { FreebuffSessionResponse } from '../../types/codebirds-session'

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
} as unknown as FreebuffSessionResponse

const activeWithoutReferral = {
  status: 'active',
  accessTier: 'full',
  model: 'minimax/minimax-m3',
  instanceId: 'i-1',
} as unknown as FreebuffSessionResponse

describe('codebirds referral cache', () => {
  beforeEach(() => {
    __resetReferralCacheForTest()
  })

  test('starts empty', () => {
    expect(getCachedReferral()).toBeUndefined()
  })

  test('remembers a referral block from a landing response', () => {
    rememberReferral(landingWithReferral)
    expect(getCachedReferral()).toEqual(referral)
  })

  test('keeps the last referral across a join → active round-trip', () => {
    // Simulates: land on picker (referral present) → join a model (server drops
    // referral from queued/active payloads). The cache must survive so
    // returning to the picker can still render the GLM banner.
    rememberReferral(landingWithReferral)
    rememberReferral(activeWithoutReferral)
    expect(getCachedReferral()).toEqual(referral)
  })

  test('ignores responses without a referral block', () => {
    rememberReferral(activeWithoutReferral)
    expect(getCachedReferral()).toBeUndefined()
  })

  test('ignores null sessions', () => {
    rememberReferral(landingWithReferral)
    rememberReferral(null)
    expect(getCachedReferral()).toEqual(referral)
  })
})
