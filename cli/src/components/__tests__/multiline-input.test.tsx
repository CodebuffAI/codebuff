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
