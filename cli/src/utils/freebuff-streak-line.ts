import { FREEBUFF_STREAK_REWARDS_ENABLED } from '@codebuff/common/constants/freebuff-models'
import { isFreebuffStreakGlmBonusActive } from '@codebuff/common/util/freebuff-streak'

/** Days in a streak "week" — the milestone the progress dots fill toward. */
export const FREEBUFF_STREAK_WEEK = 7

export interface FreebuffStreakLine {
  /** Count label, e.g. "2 day streak". */
  label: string
  /** A week's worth of progress dots toward the 7-day milestone, e.g.
   *  "●●○○○○○". Fills to "●●●●●●●" at 7, then gains a trailing "+"
   *  ("●●●●●●●+") for any streak beyond the week so long runs read as
   *  "earned and still going" rather than just maxed out. */
  dots: string
}

/**
 * Pure presentation logic for the landing-screen streak line: a plain count
 * plus a week of filled/empty progress dots. Returns null for streak <= 0 so
 * the caller hides the row entirely — new / lapsed users should be nudged to
 * start using the product, not shown an empty streak.
 */
export function getFreebuffStreakLine(streak: number): FreebuffStreakLine | null {
  if (streak <= 0) return null

  // Fill toward the 7-day milestone, then stay full — a 19-day streak should
  // read as fully earned, not roll back over into a partial second week. Past
  // the week, a trailing "+" marks that the streak has run beyond the row.
  const filled = Math.min(streak, FREEBUFF_STREAK_WEEK)
  const dots =
    '●'.repeat(filled) +
    '○'.repeat(FREEBUFF_STREAK_WEEK - filled) +
    (streak > FREEBUFF_STREAK_WEEK ? '+' : '')

  // "day" stays singular — it's a compound modifier ("7 day streak"), not a
  // count of days on its own.
  return { label: `${streak} day streak`, dots }
}

/**
 * A short perk note shown while the user is on a 7+ day streak, explaining the
 * reward they're earning by keeping it up. Returns null below the milestone so it
 * only appears once a full week has been earned.
 *
 * The daily-pool bonus (+1 session) recurs **every day** the streak stays at 7+,
 * so it's framed as "every day". The GLM 5.2 bonus is a **weekly** perk that
 * refills each Monday while the streak remains active. The exact remaining GLM
 * count lives in the referral banner; this line is the motivational why. GLM is
 * full-access only, so limited users get the daily session bonus alone.
 */
export function getFreebuffStreakBonusNote(params: {
  streak: number
  accessTier: 'full' | 'limited'
}): string | null {
  if (!FREEBUFF_STREAK_REWARDS_ENABLED) return null
  if (params.streak < FREEBUFF_STREAK_WEEK) return null
  // Only advertise GLM when the recurring full-access streak entitlement is
  // active, so the copy never promises a perk the gate won't honor.
  const includesGlm =
    params.accessTier === 'full' && isFreebuffStreakGlmBonusActive()
  return includesGlm
    ? '🎁 Streak perk: +1 bonus session every day + 1 GLM 5.2 session each week you keep it up'
    : '🎁 Streak perk: +1 bonus session every day you keep it up'
}
