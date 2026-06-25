/** Days in a streak "week" — the milestone the progress dots fill toward. */
export const FREEBUFF_STREAK_WEEK = 7

export interface FreebuffStreakLine {
  /** Count label, e.g. "2 day streak". */
  label: string
  /** A week's worth of progress dots toward the 7-day milestone, e.g.
   *  "●●○○○○○". Stays full ("●●●●●●●") once the streak reaches 7. */
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
  // read as fully earned, not roll back over into a partial second week.
  const filled = Math.min(streak, FREEBUFF_STREAK_WEEK)
  const dots =
    '●'.repeat(filled) + '○'.repeat(FREEBUFF_STREAK_WEEK - filled)

  // "day" stays singular — it's a compound modifier ("7 day streak"), not a
  // count of days on its own.
  return { label: `${streak} day streak`, dots }
}
