// The label/dots/perk-note logic is shared with Freebuff Desktop and lives in
// common; this module re-exports it and adds the terminal rendering and layout
// gating only the CLI needs.
export {
  FREEBUFF_STREAK_WEEK,
  getFreebuffStreakBonusNote,
} from '@codebuff/common/util/freebuff-streak-line'
export type { FreebuffStreakLine } from '@codebuff/common/util/freebuff-streak-line'

import {
  FREEBUFF_STREAK_WEEK,
  getFreebuffStreakBonusNote,
  getFreebuffStreakLine as getSharedFreebuffStreakLine,
} from '@codebuff/common/util/freebuff-streak-line'

import type { FreebuffStreakLine } from '@codebuff/common/util/freebuff-streak-line'

const FREEBUFF_STREAK_BONUS_MIN_HEIGHT = 30

/** Columns between the count label and its progress dots. */
export const FREEBUFF_STREAK_LABEL_GAP = 2

/** Columns kept clear between the heading and the streak when they share a
 *  row. The heading row is laid out space-between inside a shrink-to-fit
 *  column, so when the row is the widest child there is no free space to
 *  distribute and the two would otherwise render flush against each other
 *  ("Start coding for free18 day streak"). This is the floor, and the same
 *  number decides whether they may share a row at all. */
export const FREEBUFF_STREAK_INLINE_GAP = 3

/** Progress glyphs for a terminal. The shared default is ●/○, but U+25CF is
 *  missing from plenty of terminal fonts and renders as a tofu box — a
 *  CP437-derived font, for instance, has the box-drawing and block elements
 *  the CLI already draws with, and even ○, but no ●. Bullet and middle dot
 *  keep the dot look while being about as universal as glyphs get.
 *
 *  If a font ever fails these too, █/░ (Block Elements) is the fallback pair:
 *  the ASCII logo and the progress bar are built from them, so anything that
 *  renders the CLI at all renders those. */
const TERMINAL_DOT_CHARS = { filled: '•', empty: '·' }

/** The streak line as the CLI draws it. */
export function getFreebuffStreakLine(
  streak: number,
): FreebuffStreakLine | null {
  return getSharedFreebuffStreakLine(streak, TERMINAL_DOT_CHARS)
}

/** Rendered width of the streak, e.g. "18 day streak  •••••••+". */
export function getFreebuffStreakInlineWidth(line: FreebuffStreakLine): number {
  return line.label.length + FREEBUFF_STREAK_LABEL_GAP + line.dots.length
}

/** What a user with no streak yet is about to earn. The empty slot is measured
 *  against it so the row doesn't move on day one. */
const DAY_ONE_LINE = getFreebuffStreakLine(1)!

/** Whether the heading and the streak can share a row with the inline gap left
 *  clear between them. A streak long enough to widen its own label (or a
 *  narrow terminal) pushes the streak onto its own line instead of letting the
 *  two collide. */
export function fitsFreebuffStreakOnHeadingRow(params: {
  /** null when the user has no streak yet — measured as day one. */
  line: FreebuffStreakLine | null
  headingWidth: number
  availableWidth: number
}): boolean {
  return (
    params.headingWidth +
      FREEBUFF_STREAK_INLINE_GAP +
      getFreebuffStreakInlineWidth(params.line ?? DAY_ONE_LINE) <=
    params.availableWidth
  )
}

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
