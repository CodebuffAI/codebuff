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

/** Option type - can be string or object with label/description */
export type AskUserOption = string | { label: string; description?: string }

/** Helper to extract label from an option (handles both string and object formats) */
export const getOptionLabel = (option: AskUserOption): string => {
  return typeof option === 'string' ? option : option?.label ?? ''
}

/** Constant for the "Custom" option index */
export const CUSTOM_OPTION_INDEX: number = -1

export const KEYBOARD_HINTS = [
  '↑↓ navigate •',
  'Enter select',
] as const
