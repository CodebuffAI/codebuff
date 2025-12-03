import type { BorderCharacters } from '@opentui/core'

export const BORDER_CHARS: BorderCharacters = {
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  horizontal: '─',
  vertical: '│',
  topT: '┬',
  bottomT: '┴',
  leftT: '├',
  rightT: '┤',
  cross: '┼',
}

/** Dashed border characters with rounded corners for ghost/ephemeral UI */
export const DASHED_BORDER_CHARS: BorderCharacters = {
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  horizontal: '┄',
  vertical: '┆',
  topT: '┬',
  bottomT: '┴',
  leftT: '├',
  rightT: '┤',
  cross: '┼',
}

/** Square corner border for image cards (separate from the rounded default) */
export const IMAGE_CARD_BORDER_CHARS: BorderCharacters = {
  horizontal: '─',
  vertical: '│',
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  topT: '┬',
  bottomT: '┴',
  leftT: '├',
  rightT: '┤',
  cross: '┼',
}
