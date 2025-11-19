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

// Reconnection timing constants moved to @codebuff/sdk/retry-config
// Import RECONNECTION_RETRY_DELAY_MS and RECONNECTION_MESSAGE_DURATION_MS from @codebuff/sdk

// Shimmer animation
export const SHIMMER_INTERVAL_MS = 160

// Shimmer palette generation constants
export const SHIMMER_PALETTE_MIN_SIZE = 6
export const SHIMMER_PALETTE_MAX_SIZE = 24
export const SHIMMER_PALETTE_DYNAMIC_MIN = 8
export const SHIMMER_PALETTE_DYNAMIC_MAX = 20
export const SHIMMER_PALETTE_DYNAMIC_MULTIPLIER = 1.5

// Shimmer color adjustments
export const SHIMMER_LIGHTNESS_RANGE = 0.22
export const SHIMMER_LIGHTNESS_MIN = 0.08
export const SHIMMER_LIGHTNESS_MAX = 0.92
export const SHIMMER_SATURATION_SCALE_BASE = 0.88
export const SHIMMER_SATURATION_SCALE_AMPLITUDE = 0.18
export const SHIMMER_SATURATION_MIN = 0.05
export const SHIMMER_SATURATION_MAX = 1

// Shimmer text attribute thresholds
export const SHIMMER_ATTR_BOLD_THRESHOLD = 0.23
export const SHIMMER_ATTR_DIM_THRESHOLD = 0.69
