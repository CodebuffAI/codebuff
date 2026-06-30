import { describe, expect, it } from 'bun:test'

import { syncWebReferralState } from '@/server/web-referrals'

import type { SyncWebReferralDeps } from '@/server/web-referrals'

/**
 * Build a set of fake deps with call counters, overridable per test. Defaults
 * model the happy path: a redeemable cookie, both programs redeem, the clear
 * succeeds, evaluators find nothing pending, score is 0.
 */
function makeDeps(overrides: Partial<SyncWebReferralDeps> = {}): {
  deps: SyncWebReferralDeps
  calls: {
    redeem: number
    clear: number
    attribution: number
    evalWeb: number
    evalGlm: number
    score: number
  }
} {
  const calls = {
    redeem: 0,
    clear: 0,
    attribution: 0,
    evalWeb: 0,
    evalGlm: 0,
    score: 0,
  }
  const deps: SyncWebReferralDeps = {
    getReferralCode: async () => 'ref-abc',
    clearReferralCode: async () => {
      calls.clear++
    },
    redeemReferralCode: async () => {
      calls.redeem++
      return { ok: true as const, referrerId: 'referrer-1' }
    },
    recordReferralV2Attribution: async () => {
      calls.attribution++
      return true
    },
    evaluateWebReferralForReferredUser: async () => {
      calls.evalWeb++
      return { outcome: 'no_pending_referral' as const }
    },
    evaluateGlmReferralForReferredUser: async () => {
      calls.evalGlm++
      return { outcome: 'no_pending_referral' as const }
    },
    getWebReferralScore: async () => {
      calls.score++
      return 0
    },
    ...overrides,
  }
  return { deps, calls }
}

describe('syncWebReferralState', () => {
  it('redeems both programs and clears the cookie on the happy path', async () => {
    const { deps, calls } = makeDeps()

    const score = await syncWebReferralState({ userId: 'u1', deps })

    expect(calls.redeem).toBe(2) // web + glm
    expect(calls.clear).toBe(1)
    expect(calls.attribution).toBe(1) // dual-writes referral_v2 once
    expect(calls.evalWeb).toBe(1)
    expect(calls.evalGlm).toBe(1)
    expect(score).toBe(0)
  })

  it('still evaluates and returns the score when clearReferralCode throws (the CLI /onboard Server Component render, where the cookie store is read-only)', async () => {
    const { deps, calls } = makeDeps({
      clearReferralCode: async () => {
        calls.clear++
        // Mirror Next.js: cookies().delete() throws outside a Server Action /
        // Route Handler. The fix swallows this so redemption isn't aborted.
        throw new Error('Cookies can only be modified in a Server Action')
      },
      getWebReferralScore: async () => {
        calls.score++
        return 3
      },
    })

    const score = await syncWebReferralState({ userId: 'u1', deps })

    expect(calls.clear).toBe(1) // attempted...
    expect(calls.evalWeb).toBe(1) // ...but evaluation still ran
    expect(calls.evalGlm).toBe(1)
    expect(score).toBe(3) // ...and the score still came back
  })

  it('skips redeem and clear when no attribution cookie is present', async () => {
    const { deps, calls } = makeDeps({
      getReferralCode: async () => undefined,
    })

    const score = await syncWebReferralState({ userId: 'u1', deps })

    expect(calls.redeem).toBe(0)
    expect(calls.clear).toBe(0)
    expect(calls.attribution).toBe(0) // nothing to attribute without a cookie
    // Evaluation of the user's own pending referral still runs every time.
    expect(calls.evalWeb).toBe(1)
    expect(calls.evalGlm).toBe(1)
    expect(score).toBe(0)
  })

  it('keeps an unknown (invalid_code) cookie instead of clearing it', async () => {
    const { deps, calls } = makeDeps({
      redeemReferralCode: async () => {
        calls.redeem++
        return { ok: false as const, error: 'invalid_code' as const }
      },
    })

    await syncWebReferralState({ userId: 'u1', deps })

    expect(calls.redeem).toBe(2)
    expect(calls.clear).toBe(0) // left for the attribution window to expire
  })
})
