// The label/dots/perk-note logic is shared with Freebuff Desktop and lives in
// common; this module re-exports it and adds the terminal-layout gating only
// the CLI needs.
export {
  FREEBUFF_STREAK_WEEK,
  getFreebuffStreakBonusNote,
  getFreebuffStreakLine,
} from '@codebuff/common/util/freebuff-streak-line'
export type { FreebuffStreakLine } from '@codebuff/common/util/freebuff-streak-line'

import {
  FREEBUFF_STREAK_WEEK,
  getFreebuffStreakBonusNote,
} from '@codebuff/common/util/freebuff-streak-line'

const FREEBUFF_STREAK_BONUS_MIN_HEIGHT = 30

/** Returns the earned perk note only when the landing layout can show it
 * without crowding the picker or wrapping onto additional rows. */
export function getFreebuffStreakBonusNoteForLayout(params: {
  streak: number
  accessTier: 'full' | 'limited'
  terminalHeight: number
  availableWidth: number
}): string | null {
  if (params.streak < FREEBUFF_STREAK_WEEK) return null
  if (params.terminalHeight < FREEBUFF_STREAK_BONUS_MIN_HEIGHT) return null

  const note = getFreebuffStreakBonusNote(params)
  if (!note || note.length > params.availableWidth) return null

  return note
}
