import { describe, test, expect } from 'bun:test'

/**
 * Tests for tab character cursor rendering in MultilineInput component.
 *
 * The shouldHighlight logic determines whether to show a highlighted character
 * or the cursor symbol (▍) at the cursor position.
 *
 * Additionally, tabs are expanded to spaces (TAB_WIDTH=4) for proper rendering,
 * so the cursor appears at the correct visual position.
 */

/**
 * Check if a key event represents printable character input (not a special key).
 * This mirrors the function in multiline-input.tsx for testing.
 * 
 * Uses a positive heuristic based on key.name length rather than a brittle deny-list.
 * Special keys have descriptive multi-character names (like 'backspace', 'up', 'f1')
 * while regular printable characters either have no name or a single-character name.
 */
function isPrintableCharacterKey(key: { name?: string }): boolean {
  const name = key.name
  
  // No name = likely multi-byte input (Chinese, Japanese, Korean, etc.)
  if (!name) return true
  
  // Single character name = regular ASCII printable (a, b, 1, $, etc.)
  if (name.length === 1) return true
  
  // Special case: space key has name 'space' but is printable
  if (name === 'space') return true
  
  // Multi-char name = special key (up, f1, backspace, etc.)
  return false
}

/**
 * Control character regex - matches characters that should not be inserted.
 * This mirrors the constant in multiline-input.tsx for testing.
 */
const CONTROL_CHAR_REGEX = /[\u0000-\u0008\u000b-\u000c\u000e-\u001f\u007f]/

describe('MultilineInput - tab character handling', () => {
  const TAB_WIDTH = 4

  /**
   * Helper function that mimics the shouldHighlight logic from MultilineInput.
   * This tests the core fix: tabs should NOT be highlighted (like newlines).
   */
  function shouldHighlightChar(
    showCursor: boolean,
    isPlaceholder: boolean,
    cursorPosition: number,
    displayValue: string,
  ): boolean {
    return (
      showCursor &&
      !isPlaceholder &&
      cursorPosition < displayValue.length &&
      displayValue[cursorPosition] !== '\n' &&
      displayValue[cursorPosition] !== '\t' // This is the fix being tested
    )
  }

  /**
   * Calculate cursor position in expanded string (tabs -> spaces)
   */
  function calculateRenderCursorPosition(
    cursorPosition: number,
    displayValue: string,
  ): number {
    let renderPos = 0
    for (let i = 0; i < cursorPosition && i < displayValue.length; i++) {
      renderPos += displayValue[i] === '\t' ? TAB_WIDTH : 1
    }
    return renderPos
  }

  test('does NOT highlight when cursor is on a tab character', () => {
    const value = 'hello\tworld'
    const cursorPosition = 5 // Position of the tab

    const shouldHighlight = shouldHighlightChar(
      true,
      false,
      cursorPosition,
      value,
    )

    // Tab characters should not be highlighted (should show cursor symbol instead)
    expect(shouldHighlight).toBe(false)
  })

  test('does NOT highlight when cursor is on a newline character', () => {
    const value = 'line1\nline2'
    const cursorPosition = 5 // Position of the newline

    const shouldHighlight = shouldHighlightChar(
      true,
      false,
      cursorPosition,
      value,
    )

    // Newlines should not be highlighted (existing behavior)
    expect(shouldHighlight).toBe(false)
  })

  test('DOES highlight when cursor is on a regular character', () => {
    const value = 'hello'
    const cursorPosition = 1 // Position of 'e'

    const shouldHighlight = shouldHighlightChar(
      true,
      false,
      cursorPosition,
      value,
    )

    // Regular characters should be highlighted
    expect(shouldHighlight).toBe(true)
  })

  test('does NOT highlight when not focused (showCursor=false)', () => {
    const value = 'hello\tworld'
    const cursorPosition = 5

    const shouldHighlight = shouldHighlightChar(
      false,
      false,
      cursorPosition,
      value,
    )

    expect(shouldHighlight).toBe(false)
  })

  test('does NOT highlight when showing placeholder', () => {
    const value = ''
    const cursorPosition = 0

    const shouldHighlight = shouldHighlightChar(
      true,
      true,
      cursorPosition,
      value,
    )

    expect(shouldHighlight).toBe(false)
  })

  test('does NOT highlight when cursor is at end of string', () => {
    const value = 'hello'
    const cursorPosition = 5 // Beyond last character

    const shouldHighlight = shouldHighlightChar(
      true,
      false,
      cursorPosition,
      value,
    )

    expect(shouldHighlight).toBe(false)
  })

  test('handles multiple tabs - does NOT highlight tab at position 2', () => {
    const value = '\t\t\tindented'
    const cursorPosition = 2 // Third tab

    const shouldHighlight = shouldHighlightChar(
      true,
      false,
      cursorPosition,
      value,
    )

    expect(shouldHighlight).toBe(false)
  })

  test('handles tab at end of string', () => {
    const value = 'text\t'
    const cursorPosition = 4 // Position of trailing tab

    const shouldHighlight = shouldHighlightChar(
      true,
      false,
      cursorPosition,
      value,
    )

    expect(shouldHighlight).toBe(false)
  })

  test('handles space character - DOES highlight (spaces are visible)', () => {
    const value = 'hello world'
    const cursorPosition = 5 // Position of space

    const shouldHighlight = shouldHighlightChar(
      true,
      false,
      cursorPosition,
      value,
    )

    // Spaces should be highlighted (they are visible characters)
    expect(shouldHighlight).toBe(true)
  })

  test('expands single tab to 4 spaces for rendering', () => {
    const value = 'hello\tworld'
    const cursorPosition = 6 // After the tab

    const renderPos = calculateRenderCursorPosition(cursorPosition, value)

    // Position 6 in original = position 9 in rendered (5 chars + 4-space tab)
    expect(renderPos).toBe(9)
  })

  test('expands multiple tabs correctly', () => {
    const value = '\t\t\ttest'
    const cursorPosition = 3 // After 3 tabs

    const renderPos = calculateRenderCursorPosition(cursorPosition, value)

    // 3 tabs = 12 spaces
    expect(renderPos).toBe(12)
  })

  test('mixed content with tabs calculates correct render position', () => {
    const value = 'a\tb\tc'
    const cursorPosition = 3 // After 'a', tab, 'b'

    const renderPos = calculateRenderCursorPosition(cursorPosition, value)

    // 'a' (1) + tab (4) + 'b' (1) = 6
    expect(renderPos).toBe(6)
  })
})

/**
 * Tests for Chinese/IME character input handling in MultilineInput component.
 *
 * Chinese characters (and other CJK characters) are multi-byte UTF-8 sequences
 * that come from Input Method Editors (IME). The component must accept these
 * characters even though key.sequence.length > 1.
 */
describe('MultilineInput - Chinese/IME character input', () => {
  /**
   * Helper function that mimics the character input acceptance logic from MultilineInput.
   * Returns true if the key event should result in text being inserted.
   */
  function shouldAcceptCharacterInput(key: {
    sequence?: string
    name?: string
    ctrl?: boolean
    meta?: boolean
    option?: boolean
  }): boolean {
    // Must have a sequence with at least one character
    if (!key.sequence || key.sequence.length < 1) {
      return false
    }

    // No modifier keys allowed
    if (key.ctrl || key.meta || key.option) {
      return false
    }

    // Must not be a control character
    if (CONTROL_CHAR_REGEX.test(key.sequence)) {
      return false
    }

    // Must be a printable character key (not a special key like arrows, function keys, etc.)
    if (!isPrintableCharacterKey(key)) {
      return false
    }

    return true
  }

  test('accepts single Chinese character (你)', () => {
    const key = {
      sequence: '你',
      name: undefined,
      ctrl: false,
      meta: false,
      option: false,
    }

    expect(shouldAcceptCharacterInput(key)).toBe(true)
  })

  test('accepts Chinese phrase (你好)', () => {
    const key = {
      sequence: '你好',
      name: undefined,
      ctrl: false,
      meta: false,
      option: false,
    }

    expect(shouldAcceptCharacterInput(key)).toBe(true)
  })

  test('accepts longer Chinese text (你好世界)', () => {
    const key = {
      sequence: '你好世界',
      name: undefined,
      ctrl: false,
      meta: false,
      option: false,
    }

    expect(shouldAcceptCharacterInput(key)).toBe(true)
  })

  test('accepts Japanese hiragana (あいうえお)', () => {
    const key = {
      sequence: 'あいうえお',
      name: undefined,
      ctrl: false,
      meta: false,
      option: false,
    }

    expect(shouldAcceptCharacterInput(key)).toBe(true)
  })

  test('accepts Japanese kanji (日本語)', () => {
    const key = {
      sequence: '日本語',
      name: undefined,
      ctrl: false,
      meta: false,
      option: false,
    }

    expect(shouldAcceptCharacterInput(key)).toBe(true)
  })

  test('accepts Korean characters (한글)', () => {
    const key = {
      sequence: '한글',
      name: undefined,
      ctrl: false,
      meta: false,
      option: false,
    }

    expect(shouldAcceptCharacterInput(key)).toBe(true)
  })

  test('accepts emoji characters (😀🎉)', () => {
    const key = {
      sequence: '😀🎉',
      name: undefined,
      ctrl: false,
      meta: false,
      option: false,
    }

    expect(shouldAcceptCharacterInput(key)).toBe(true)
  })

  test('accepts space key (name="space")', () => {
    const key = {
      sequence: ' ',
      name: 'space',
      ctrl: false,
      meta: false,
      option: false,
    }

    expect(shouldAcceptCharacterInput(key)).toBe(true)
  })

  test('accepts single ASCII character (a)', () => {
    const key = {
      sequence: 'a',
      name: undefined,
      ctrl: false,
      meta: false,
      option: false,
    }

    expect(shouldAcceptCharacterInput(key)).toBe(true)
  })

  test('rejects arrow key (up)', () => {
    const key = {
      sequence: '\x1b[A',
      name: 'up',
      ctrl: false,
      meta: false,
      option: false,
    }

    expect(shouldAcceptCharacterInput(key)).toBe(false)
  })

  test('rejects function key (f1)', () => {
    const key = {
      sequence: '\x1bOP',
      name: 'f1',
      ctrl: false,
      meta: false,
      option: false,
    }

    expect(shouldAcceptCharacterInput(key)).toBe(false)
  })

  test('rejects backspace key', () => {
    const key = {
      sequence: '\x7f',
      name: 'backspace',
      ctrl: false,
      meta: false,
      option: false,
    }

    expect(shouldAcceptCharacterInput(key)).toBe(false)
  })

  test('rejects enter key', () => {
    const key = {
      sequence: '\r',
      name: 'return',
      ctrl: false,
      meta: false,
      option: false,
    }

    expect(shouldAcceptCharacterInput(key)).toBe(false)
  })

  test('rejects escape key', () => {
    const key = {
      sequence: '\x1b',
      name: 'escape',
      ctrl: false,
      meta: false,
      option: false,
    }

    expect(shouldAcceptCharacterInput(key)).toBe(false)
  })

  test('rejects input with ctrl modifier', () => {
    const key = {
      sequence: '你',
      name: undefined,
      ctrl: true,
      meta: false,
      option: false,
    }

    expect(shouldAcceptCharacterInput(key)).toBe(false)
  })

  test('rejects input with meta modifier', () => {
    const key = {
      sequence: '你',
      name: undefined,
      ctrl: false,
      meta: true,
      option: false,
    }

    expect(shouldAcceptCharacterInput(key)).toBe(false)
  })

  test('rejects input with option modifier', () => {
    const key = {
      sequence: '你',
      name: undefined,
      ctrl: false,
      meta: false,
      option: true,
    }

    expect(shouldAcceptCharacterInput(key)).toBe(false)
  })

  test('rejects empty sequence', () => {
    const key = {
      sequence: '',
      name: undefined,
      ctrl: false,
      meta: false,
      option: false,
    }

    expect(shouldAcceptCharacterInput(key)).toBe(false)
  })

  test('rejects undefined sequence', () => {
    const key = {
      sequence: undefined,
      name: undefined,
      ctrl: false,
      meta: false,
      option: false,
    }

    expect(shouldAcceptCharacterInput(key)).toBe(false)
  })

  test('rejects control character (null byte)', () => {
    const key = {
      sequence: '\x00',
      name: undefined,
      ctrl: false,
      meta: false,
      option: false,
    }

    expect(shouldAcceptCharacterInput(key)).toBe(false)
  })

  test('rejects control character (bell)', () => {
    const key = {
      sequence: '\x07',
      name: undefined,
      ctrl: false,
      meta: false,
      option: false,
    }

    expect(shouldAcceptCharacterInput(key)).toBe(false)
  })

  test('accepts mixed Chinese and ASCII (Hello你好)', () => {
    const key = {
      sequence: 'Hello你好',
      name: undefined,
      ctrl: false,
      meta: false,
      option: false,
    }

    expect(shouldAcceptCharacterInput(key)).toBe(true)
  })

  test('accepts Arabic characters (مرحبا)', () => {
    const key = {
      sequence: 'مرحبا',
      name: undefined,
      ctrl: false,
      meta: false,
      option: false,
    }

    expect(shouldAcceptCharacterInput(key)).toBe(true)
  })

  test('accepts Thai characters (สวัสดี)', () => {
    const key = {
      sequence: 'สวัสดี',
      name: undefined,
      ctrl: false,
      meta: false,
      option: false,
    }

    expect(shouldAcceptCharacterInput(key)).toBe(true)
  })

  test('accepts Russian/Cyrillic characters (Привет)', () => {
    const key = {
      sequence: 'Привет',
      name: undefined,
      ctrl: false,
      meta: false,
      option: false,
    }

    expect(shouldAcceptCharacterInput(key)).toBe(true)
  })
})

/**
 * Tests for newline keyboard shortcuts in MultilineInput component.
 *
 * These test the handleEnterKeys logic which determines whether:
 * - A newline should be inserted (Ctrl+J, Shift+Enter, Option+Enter, Backslash+Enter)
 * - The input should be submitted (plain Enter)
 * - The key should be ignored (other keys)
 */
describe('MultilineInput - newline keyboard shortcuts', () => {
  /**
   * Helper function that checks for alt-like modifier keys.
   * This mirrors the isAltModifier function in multiline-input.tsx.
   */
  function isAltModifier(key: {
    option?: boolean
    sequence?: string
  }): boolean {
    const ESC = '\x1b'
    return Boolean(
      key.option ||
        (key.sequence?.length === 2 &&
          key.sequence[0] === ESC &&
          key.sequence[1] !== '['),
    )
  }

  /**
   * Determines the action that handleEnterKeys would take for a given key event.
   * Returns 'newline' if it should insert a newline, 'submit' if it should submit,
   * or 'ignore' if the key should not be handled.
   *
   * This mirrors the handleEnterKeys logic in multiline-input.tsx.
   */
  function getEnterKeyAction(
    key: {
      name?: string
      sequence?: string
      ctrl?: boolean
      meta?: boolean
      shift?: boolean
      option?: boolean
    },
    hasBackslashBeforeCursor: boolean = false,
  ): 'newline' | 'submit' | 'ignore' {
    const lowerKeyName = (key.name ?? '').toLowerCase()
    const isEnterKey = key.name === 'return' || key.name === 'enter'
    // Ctrl+J is translated by the terminal to a linefeed character (0x0a)
    // So we detect it by checking for name === 'linefeed' rather than ctrl + j
    const isCtrlJ =
      lowerKeyName === 'linefeed' ||
      (key.ctrl &&
        !key.meta &&
        !key.option &&
        lowerKeyName === 'j')

    // Only handle Enter and Ctrl+J here
    if (!isEnterKey && !isCtrlJ) return 'ignore'

    const isAltLikeModifier = isAltModifier(key)
    const hasEscapePrefix =
      typeof key.sequence === 'string' &&
      key.sequence.length > 0 &&
      key.sequence.charCodeAt(0) === 0x1b

    const isPlainEnter =
      isEnterKey &&
      !key.shift &&
      !key.ctrl &&
      !key.meta &&
      !key.option &&
      !isAltLikeModifier &&
      !hasEscapePrefix &&
      key.sequence === '\r' &&
      !hasBackslashBeforeCursor
    const isShiftEnter =
      isEnterKey && (Boolean(key.shift) || key.sequence === '\n')
    const isOptionEnter =
      isEnterKey && (isAltLikeModifier || hasEscapePrefix)
    const isBackslashEnter = isEnterKey && hasBackslashBeforeCursor

    const shouldInsertNewline =
      isCtrlJ || isShiftEnter || isOptionEnter || isBackslashEnter

    if (shouldInsertNewline) return 'newline'
    if (isPlainEnter) return 'submit'

    return 'ignore'
  }

  // --- Ctrl+J tests ---
  // Note: Terminals translate Ctrl+J to a linefeed character (0x0a) with name 'linefeed'
  // The ctrl flag is NOT set because the terminal performs the translation

  test('Ctrl+J inserts newline (detected as linefeed)', () => {
    // This is what terminals actually send when Ctrl+J is pressed
    const key = {
      name: 'linefeed',
      sequence: '\n',
      ctrl: false, // Terminal strips the ctrl flag
      meta: false,
      shift: false,
      option: false,
    }

    expect(getEnterKeyAction(key)).toBe('newline')
  })

  test('Ctrl+J with uppercase LINEFEED name also works', () => {
    const key = {
      name: 'LINEFEED',
      sequence: '\n',
      ctrl: false,
      meta: false,
      shift: false,
      option: false,
    }

    expect(getEnterKeyAction(key)).toBe('newline')
  })

  test('Ctrl+J fallback: raw ctrl+j event (if terminal passes it through)', () => {
    // Some terminals might pass through the raw key event
    const key = {
      name: 'j',
      sequence: '\n',
      ctrl: true,
      meta: false,
      shift: false,
      option: false,
    }

    expect(getEnterKeyAction(key)).toBe('newline')
  })

  test('Ctrl+Meta+J does not insert newline (meta blocks it)', () => {
    const key = {
      name: 'j',
      sequence: '\n',
      ctrl: true,
      meta: true,
      shift: false,
      option: false,
    }

    expect(getEnterKeyAction(key)).toBe('ignore')
  })

  test('Ctrl+Option+J does not insert newline (option blocks it)', () => {
    const key = {
      name: 'j',
      sequence: '\n',
      ctrl: true,
      meta: false,
      shift: false,
      option: true,
    }

    expect(getEnterKeyAction(key)).toBe('ignore')
  })

  // --- Ctrl+Enter (non-J) tests ---

  test('Ctrl+Enter (with return name) is ignored', () => {
    const key = {
      name: 'return',
      sequence: '\r',
      ctrl: true,
      meta: false,
      shift: false,
      option: false,
    }

    expect(getEnterKeyAction(key)).toBe('ignore')
  })

  // --- Shift+Enter tests ---

  test('Shift+Enter inserts newline (via shift flag)', () => {
    const key = {
      name: 'return',
      sequence: '\r',
      ctrl: false,
      meta: false,
      shift: true,
      option: false,
    }

    expect(getEnterKeyAction(key)).toBe('newline')
  })

  test('Shift+Enter inserts newline (via sequence being newline char)', () => {
    // Some terminals send \n instead of setting shift flag
    const key = {
      name: 'return',
      sequence: '\n',
      ctrl: false,
      meta: false,
      shift: false,
      option: false,
    }

    expect(getEnterKeyAction(key)).toBe('newline')
  })

  test('Shift+Enter with "enter" key name also works', () => {
    const key = {
      name: 'enter',
      sequence: '\r',
      ctrl: false,
      meta: false,
      shift: true,
      option: false,
    }

    expect(getEnterKeyAction(key)).toBe('newline')
  })

  // --- Option/Alt+Enter tests ---

  test('Option+Enter inserts newline (via option flag)', () => {
    const key = {
      name: 'return',
      sequence: '\r',
      ctrl: false,
      meta: false,
      shift: false,
      option: true,
    }

    expect(getEnterKeyAction(key)).toBe('newline')
  })

  test('Option+Enter inserts newline (via escape prefix sequence)', () => {
    // Alt key often sends ESC prefix followed by the key
    const key = {
      name: 'return',
      sequence: '\x1b\r', // ESC + carriage return
      ctrl: false,
      meta: false,
      shift: false,
      option: false,
    }

    expect(getEnterKeyAction(key)).toBe('newline')
  })

  test('Escape prefix with bracket does NOT trigger alt detection', () => {
    // Sequences like ESC+[ are ANSI escape codes, not alt+key
    // This should be treated differently based on hasEscapePrefix
    const key = {
      name: 'return',
      sequence: '\x1b[', // This is an escape sequence, not alt+enter
      ctrl: false,
      meta: false,
      shift: false,
      option: false,
    }

    // hasEscapePrefix is still true, so isOptionEnter is true
    expect(getEnterKeyAction(key)).toBe('newline')
  })

  // --- Backslash+Enter tests ---

  test('Backslash+Enter inserts newline (removes backslash)', () => {
    const key = {
      name: 'return',
      sequence: '\r',
      ctrl: false,
      meta: false,
      shift: false,
      option: false,
    }

    // When there's a backslash before cursor, it should insert newline
    expect(getEnterKeyAction(key, true)).toBe('newline')
  })

  test('Backslash+Shift+Enter still inserts newline', () => {
    const key = {
      name: 'return',
      sequence: '\r',
      ctrl: false,
      meta: false,
      shift: true,
      option: false,
    }

    // Both backslash and shift trigger newline
    expect(getEnterKeyAction(key, true)).toBe('newline')
  })

  // --- Plain Enter tests ---

  test('Plain Enter submits', () => {
    const key = {
      name: 'return',
      sequence: '\r',
      ctrl: false,
      meta: false,
      shift: false,
      option: false,
    }

    expect(getEnterKeyAction(key, false)).toBe('submit')
  })

  test('Plain Enter with "enter" key name submits', () => {
    const key = {
      name: 'enter',
      sequence: '\r',
      ctrl: false,
      meta: false,
      shift: false,
      option: false,
    }

    expect(getEnterKeyAction(key, false)).toBe('submit')
  })

  // --- Non-Enter key tests ---

  test('Regular J key (no ctrl) is ignored', () => {
    const key = {
      name: 'j',
      sequence: 'j',
      ctrl: false,
      meta: false,
      shift: false,
      option: false,
    }

    expect(getEnterKeyAction(key)).toBe('ignore')
  })

  test('Arrow key is ignored', () => {
    const key = {
      name: 'up',
      sequence: '\x1b[A',
      ctrl: false,
      meta: false,
      shift: false,
      option: false,
    }

    expect(getEnterKeyAction(key)).toBe('ignore')
  })

  test('Backspace is ignored', () => {
    const key = {
      name: 'backspace',
      sequence: '\x7f',
      ctrl: false,
      meta: false,
      shift: false,
      option: false,
    }

    expect(getEnterKeyAction(key)).toBe('ignore')
  })

  test('Tab is ignored', () => {
    const key = {
      name: 'tab',
      sequence: '\t',
      ctrl: false,
      meta: false,
      shift: false,
      option: false,
    }

    expect(getEnterKeyAction(key)).toBe('ignore')
  })

  // --- isAltModifier helper tests ---

  test('isAltModifier returns true when option flag is set', () => {
    expect(isAltModifier({ option: true, sequence: '\r' })).toBe(true)
  })

  test('isAltModifier returns true for ESC+char sequence (alt key)', () => {
    // Alt+a typically sends ESC followed by 'a'
    expect(isAltModifier({ option: false, sequence: '\x1ba' })).toBe(true)
  })

  test('isAltModifier returns false for ESC+[ sequence (ANSI escape)', () => {
    // ESC+[ is an ANSI escape code prefix, not alt+[
    expect(isAltModifier({ option: false, sequence: '\x1b[' })).toBe(false)
  })

  test('isAltModifier returns false for plain sequence', () => {
    expect(isAltModifier({ option: false, sequence: 'a' })).toBe(false)
  })

  test('isAltModifier returns false for empty sequence', () => {
    expect(isAltModifier({ option: false, sequence: '' })).toBe(false)
  })

  test('isAltModifier returns false for undefined sequence', () => {
    expect(isAltModifier({ option: false })).toBe(false)
  })
})
