import { describe, it, expect } from 'bun:test'

import {
  hasUsageOnFullAccessDay,
  REDEEM_REFERRAL_ERROR_MESSAGES,
  REDEEM_REFERRAL_ERROR_STATUS,
  REFERRAL_SIGNUP_WINDOW_DAYS,
} from '../referral-program'

import type { RedeemReferralError } from '../referral-program'

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
