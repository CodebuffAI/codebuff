import { FREEBUFF_GLM_V52_REFERRAL_CAP } from '@codebuff/common/constants/freebuff-models'
import { REFERRAL_CLI_DAILY_SESSION_BONUS_CAP } from '@codebuff/common/constants/freebuff-referral-tiers'
import { describe, expect, it } from 'bun:test'

import {
  cliDailySessionBonusFromStats,
  glmWeeklySessionsFromStats,
  type ReferralStats,
} from '../referral-stats'

const stats = (
  fullQualified: number,
  limitedQualified: number,
): ReferralStats => ({ fullQualified, limitedQualified })

describe('glmWeeklySessionsFromStats', () => {
  it('grants one GLM session per full-access referral', () => {
    expect(glmWeeklySessionsFromStats(stats(0, 0))).toBe(0)
    expect(glmWeeklySessionsFromStats(stats(3, 0))).toBe(3)
  })

  it('ignores limited-access referrals entirely (full access required)', () => {
    expect(glmWeeklySessionsFromStats(stats(0, 9))).toBe(0)
    expect(glmWeeklySessionsFromStats(stats(2, 9))).toBe(2)
  })

  it('caps at FREEBUFF_GLM_V52_REFERRAL_CAP', () => {
    expect(glmWeeklySessionsFromStats(stats(999, 0))).toBe(
      FREEBUFF_GLM_V52_REFERRAL_CAP,
    )
  })
})

describe('cliDailySessionBonusFromStats', () => {
  it('grants +1 daily session per limited-access referral', () => {
    expect(cliDailySessionBonusFromStats(stats(0, 0))).toBe(0)
    expect(cliDailySessionBonusFromStats(stats(0, 2))).toBe(2)
  })

  it('ignores full-access referrals (those earn GLM instead)', () => {
    expect(cliDailySessionBonusFromStats(stats(9, 0))).toBe(0)
    expect(cliDailySessionBonusFromStats(stats(9, 1))).toBe(1)
  })

  it('caps the bonus at REFERRAL_CLI_DAILY_SESSION_BONUS_CAP', () => {
    expect(cliDailySessionBonusFromStats(stats(0, 999))).toBe(
      REFERRAL_CLI_DAILY_SESSION_BONUS_CAP,
    )
    // e.g. 5 base + cap = 8/day
    expect(5 + cliDailySessionBonusFromStats(stats(0, 999))).toBe(8)
  })
})
