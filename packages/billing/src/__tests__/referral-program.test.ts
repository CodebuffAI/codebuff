import { describe, it, expect } from 'bun:test'

import {
  ALL_REFERRAL_PROGRAMS,
  evaluatePendingReferrals,
  hasUsageOnFullAccessDay,
  REDEEM_REFERRAL_ERROR_MESSAGES,
  REDEEM_REFERRAL_ERROR_STATUS,
  REFERRAL_SIGNUP_WINDOW_DAYS,
} from '../referral-program'

import type {
  RedeemReferralError,
  ReferralEvaluation,
  ReferralEvaluator,
  ReferralProgram,
} from '../referral-program'
import type { Logger } from '@codebuff/common/types/contracts/logger'

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as unknown as Logger

describe('hasUsageOnFullAccessDay', () => {
  // usage_date keys are America/Los_Angeles dates (getFreebuffUsageDateKey).
  // 2026-06-10T05:00:00Z is 2026-06-09 22:00 in LA (PDT, UTC-7).
  const LATE_LA_EVENING_UTC = new Date('2026-06-10T05:00:00.000Z')

  it('matches when a full-access admit and a usage day fall on the same LA day', () => {
    expect(
      hasUsageOnFullAccessDay({
        fullAccessAdmitTimes: [new Date('2026-06-09T20:00:00.000Z')], // 13:00 LA
        usageDateKeys: ['2026-06-09'],
      }),
    ).toBe(true)
  })

  it('uses LA days, not UTC days, for the match', () => {
    // Admit is 06-10 in UTC but 06-09 in LA; usage day key 2026-06-09 matches.
    expect(
      hasUsageOnFullAccessDay({
        fullAccessAdmitTimes: [LATE_LA_EVENING_UTC],
        usageDateKeys: ['2026-06-09'],
      }),
    ).toBe(true)
    // And the UTC date string does NOT match that admit.
    expect(
      hasUsageOnFullAccessDay({
        fullAccessAdmitTimes: [LATE_LA_EVENING_UTC],
        usageDateKeys: ['2026-06-10'],
      }),
    ).toBe(false)
  })

  it('does not match usage on a different day than any full admit', () => {
    expect(
      hasUsageOnFullAccessDay({
        fullAccessAdmitTimes: [new Date('2026-06-01T20:00:00.000Z')],
        usageDateKeys: ['2026-06-02', '2026-06-03'],
      }),
    ).toBe(false)
  })

  it('is false with no admits or no usage days', () => {
    expect(
      hasUsageOnFullAccessDay({
        fullAccessAdmitTimes: [],
        usageDateKeys: ['2026-06-09'],
      }),
    ).toBe(false)
    expect(
      hasUsageOnFullAccessDay({
        fullAccessAdmitTimes: [new Date()],
        usageDateKeys: [],
      }),
    ).toBe(false)
  })

  it('matches when any one of several admits lands on a usage day', () => {
    expect(
      hasUsageOnFullAccessDay({
        fullAccessAdmitTimes: [
          new Date('2026-05-01T20:00:00.000Z'),
          new Date('2026-06-09T20:00:00.000Z'),
        ],
        usageDateKeys: ['2026-06-09'],
      }),
    ).toBe(true)
  })
})

describe('redeem error messages', () => {
  it('covers every error code with a user-facing message', () => {
    const codes: RedeemReferralError[] = [
      'invalid_code',
      'self_referral',
      'already_referred',
      'reverse_referral',
      'referrer_limit_reached',
      'signup_too_old',
      'user_not_found',
      'user_banned',
    ]
    for (const code of codes) {
      expect(REDEEM_REFERRAL_ERROR_MESSAGES[code]).toBeTruthy()
      expect(REDEEM_REFERRAL_ERROR_STATUS[code]).toBeGreaterThanOrEqual(400)
    }
  })

  it('signup window message matches the constant', () => {
    expect(REDEEM_REFERRAL_ERROR_MESSAGES.signup_too_old).toContain(
      String(REFERRAL_SIGNUP_WINDOW_DAYS),
    )
  })
})

describe('evaluatePendingReferrals (sweep orchestration)', () => {
  const completed = (): ReferralEvaluation => ({
    outcome: 'completed',
    referrerId: 'r',
  })
  const notQualified = (): ReferralEvaluation => ({
    outcome: 'not_qualified',
    reason: 'account_too_new',
  })

  // Record every (program, userId) the sweep dispatched, and return a fixed
  // outcome per program so we can assert the per-program tallies.
  function makeEvaluators(
    outcomes: Partial<Record<ReferralProgram, () => ReferralEvaluation>>,
    calls: Array<{ program: ReferralProgram; userId: string }>,
  ): Record<ReferralProgram, ReferralEvaluator> {
    const make =
      (program: ReferralProgram): ReferralEvaluator =>
      async ({ userId }) => {
        calls.push({ program, userId })
        return (outcomes[program] ?? notQualified)()
      }
    return { cli: make('cli'), web: make('web'), glm: make('glm') }
  }

  it('sweeps every program by default and dispatches to the matching evaluator', async () => {
    const calls: Array<{ program: ReferralProgram; userId: string }> = []
    const pending: Record<ReferralProgram, string[]> = {
      cli: ['c1'],
      web: ['w1', 'w2'],
      glm: ['g1', 'g2', 'g3'],
    }
    const result = await evaluatePendingReferrals({
      logger: noopLogger,
      fetchPending: async (program) => pending[program],
      evaluators: makeEvaluators(
        { web: completed, glm: completed },
        calls,
      ),
    })

    // Every pending row in every program was evaluated with its own evaluator.
    expect(new Set(ALL_REFERRAL_PROGRAMS)).toEqual(
      new Set(['cli', 'web', 'glm']),
    )
    expect(calls.filter((c) => c.program === 'glm').map((c) => c.userId)).toEqual([
      'g1',
      'g2',
      'g3',
    ])
    expect(result.evaluated).toBe(6)
    // web (2) + glm (3) returned completed; cli returned not_qualified.
    expect(result.completed).toBe(5)
    expect(result.byProgram).toEqual({
      cli: { evaluated: 1, completed: 0 },
      web: { evaluated: 2, completed: 2 },
      glm: { evaluated: 3, completed: 3 },
    })
  })

  it('skips a row whose evaluator throws without aborting the rest of the run', async () => {
    const seen: string[] = []
    const evaluators: Record<ReferralProgram, ReferralEvaluator> = {
      cli: async () => notQualified(),
      web: async () => notQualified(),
      glm: async ({ userId }) => {
        seen.push(userId)
        if (userId === 'boom') throw new Error('github exploded')
        return completed()
      },
    }
    const result = await evaluatePendingReferrals({
      logger: noopLogger,
      programs: ['glm'],
      fetchPending: async () => ['g1', 'boom', 'g3'],
      evaluators,
    })

    // All three were attempted even though the middle one threw.
    expect(seen).toEqual(['g1', 'boom', 'g3'])
    expect(result.evaluated).toBe(3)
    expect(result.completed).toBe(2)
    expect(result.byProgram.glm).toEqual({ evaluated: 3, completed: 2 })
  })

  it('only sweeps the requested programs and passes the per-program limit through', async () => {
    const calls: Array<{ program: ReferralProgram; userId: string }> = []
    const limits: number[] = []
    const result = await evaluatePendingReferrals({
      logger: noopLogger,
      programs: ['glm'],
      limit: 7,
      fetchPending: async (_program, limit) => {
        limits.push(limit)
        return ['g1']
      },
      evaluators: makeEvaluators({ glm: completed }, calls),
    })

    expect(limits).toEqual([7])
    expect(calls.every((c) => c.program === 'glm')).toBe(true)
    expect(result.byProgram).toEqual({ glm: { evaluated: 1, completed: 1 } })
    expect(result.evaluated).toBe(1)
  })
})
