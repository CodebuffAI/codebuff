import { BorderCharacters } from '@opentui/core'

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

export const RECONNECTION_RETRY_DELAY_MS = 500
export const RECONNECTION_MESSAGE_DURATION_MS = 2000
export const SHIMMER_INTERVAL_MS = 160
