/**
 * Configuration constants for the ask_user tool
 */

export const ASK_USER_CONFIG = {
  /** Minimum terminal width (in characters) to show buttons inline */
  MIN_WIDTH_FOR_INLINE_BUTTONS: 55,

  /** Delay in milliseconds before auto-advancing to next question */
  AUTO_ADVANCE_DELAY_MS: 150,

  /** Maximum length for "Other" text input */
  MAX_OTHER_TEXT_LENGTH: 500,

  /** Whether to wrap around when navigating questions (left on first → last) */
  WRAP_QUESTIONS: true,

  /** Whether to wrap around when navigating options (up on first → last) */
  WRAP_OPTIONS: false,

  /** Show keyboard shortcuts hint by default */
  SHOW_KEYBOARD_HINTS_BY_DEFAULT: true,

  /** Auto-hide keyboard hints after this delay (milliseconds) */
  KEYBOARD_HINTS_AUTO_HIDE_MS: 5000,
} as const

/**
 * Terminal width breakpoints for responsive layouts
 */
export const LAYOUT_BREAKPOINTS = {
  /** Compact layout: minimal spacing, vertical buttons */
  COMPACT: 40,

  /** Comfortable layout: current behavior */
  COMFORTABLE: 40,

  /** Spacious layout: extra padding, inline descriptions */
  SPACIOUS: 80,
} as const

/**
 * Visual symbols used in the UI
 */
export const SYMBOLS = {
  /** Selected radio button */
  SELECTED: '●',

  /** Unselected radio button */
  UNSELECTED: '○',

  /** Completed question indicator */
  COMPLETED: '✓',

  /** Current question indicator */
  CURRENT: '●',

  /** Checked checkbox (multi-select) */
  CHECKBOX_CHECKED: '☑',

  /** Unchecked checkbox (multi-select) */
  CHECKBOX_UNCHECKED: '☐',
} as const
