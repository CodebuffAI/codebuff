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
    attributionSignals: unknown[]
    activation: number
    activationTiers: string[]
    userDevices: string[]
    evalWeb: number
    evalGlm: number
    score: number
  }
} {
  const calls = {
    redeem: 0,
    clear: 0,
    attribution: 0,
    attributionSignals: [] as unknown[],
    activation: 0,
    activationTiers: [] as string[],
    userDevices: [] as string[],
    evalWeb: 0,
    evalGlm: 0,
    score: 0,
  }
  const deps: SyncWebReferralDeps = {
    getReferralCode: async () => 'ref-abc',
    clearReferralCode: async () => {
      calls.clear++
    },
    ensureDeviceId: async () => 'device-1',
    redeemReferralCode: async () => {
      calls.redeem++
      return { ok: true as const, referrerId: 'referrer-1' }
    },
    recordReferralV2Attribution: async ({ signals }) => {
      calls.attribution++
      calls.attributionSignals.push(signals)
      return true
    },
    recordUserDevice: async ({ deviceId }) => {
      calls.userDevices.push(deviceId)
    },
    recordReferralV2Activation: async ({ accessTier }) => {
      calls.activation++
      calls.activationTiers.push(accessTier)
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

  it('activates the referral at the supplied verified tier (the convex-token hop)', async () => {
    const { deps, calls } = makeDeps()

    await syncWebReferralState({
      userId: 'u1',
      activation: { accessTier: 'full' },
      deps,
    })

    expect(calls.activation).toBe(1)
    expect(calls.activationTiers).toEqual(['full'])
  })

  it('does not activate when no activation input is supplied (the CLI /onboard hop — logging in is not product use)', async () => {
    const { deps, calls } = makeDeps()

    await syncWebReferralState({ userId: 'u1', deps })

    expect(calls.activation).toBe(0)
  })

  it('records the device for the signed-in user and passes signals to attribution', async () => {
    const { deps, calls } = makeDeps()

    await syncWebReferralState({
      userId: 'u1',
      clientIpHash: 'iphash-1',
      deps,
    })

    expect(calls.userDevices).toEqual(['device-1'])
    expect(calls.attributionSignals).toEqual([
      { ipHash: 'iphash-1', deviceId: 'device-1' },
    ])
  })

  it('degrades to null signals when the device cookie is unavailable (read-only store)', async () => {
    const { deps, calls } = makeDeps({
      ensureDeviceId: async () => undefined,
    })

    await syncWebReferralState({ userId: 'u1', deps })

    expect(calls.userDevices).toEqual([]) // nothing to record
    expect(calls.attributionSignals).toEqual([
      { ipHash: null, deviceId: null },
    ])
  })

  it('still redeems when device recording throws (best-effort)', async () => {
    const { deps, calls } = makeDeps({
      recordUserDevice: async () => {
        throw new Error('db unavailable')
      },
    })

    const score = await syncWebReferralState({ userId: 'u1', deps })

    expect(calls.redeem).toBe(2)
    expect(calls.attribution).toBe(1)
    expect(score).toBe(0)
  })

  it('still evaluates and returns the score when activation throws (best-effort)', async () => {
    const { deps, calls } = makeDeps({
      recordReferralV2Activation: async () => {
        calls.activation++
        throw new Error('db unavailable')
      },
      getWebReferralScore: async () => {
        calls.score++
        return 2
      },
    })

    const score = await syncWebReferralState({
      userId: 'u1',
      activation: { accessTier: 'limited' },
      deps,
    })

    expect(calls.activation).toBe(1)
    expect(calls.evalWeb).toBe(1)
    expect(calls.evalGlm).toBe(1)
    expect(score).toBe(2)
  })
})
