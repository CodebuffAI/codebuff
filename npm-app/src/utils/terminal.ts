/**
 * Terminal control utilities and ANSI escape sequences
 * Centralized location for all terminal manipulation constants
 */

// ANSI escape sequences for alternate screen buffer
export const ENTER_ALT_BUFFER = '\x1b[?1049h'
export const EXIT_ALT_BUFFER = '\x1b[?1049l'
export const CLEAR_SCREEN = '\x1b[2J\x1b[H'
export const HIDE_CURSOR = '\x1b[?25l'
export const SHOW_CURSOR = '\x1b[?25h'

// Cursor movement
export const MOVE_CURSOR = (row: number, col: number) => `\x1b[${row};${col}H`

// Alternative cursor control sequences (used in spinner)
export const HIDE_CURSOR_ALT = '\u001B[?25l'
export const SHOW_CURSOR_ALT = '\u001B[?25h'

// Terminal control utilities
export const TerminalControl = {
  enterAltBuffer: () => process.stdout.write(ENTER_ALT_BUFFER),
  exitAltBuffer: () => process.stdout.write(EXIT_ALT_BUFFER),
  clearScreen: () => process.stdout.write(CLEAR_SCREEN),
  hideCursor: () => process.stdout.write(HIDE_CURSOR),
  showCursor: () => process.stdout.write(SHOW_CURSOR),
  moveCursor: (row: number, col: number) =>
    process.stdout.write(MOVE_CURSOR(row, col)),
} as const
