import { describe, expect, test } from 'bun:test'

import { calculateNewCursorPosition } from '../word-wrap-utils'

// Text: "abc\ndefgh\nij"
//        ^0   ^4    ^10
// Line 0: "abc"   starts at 0, newline at index 3
// Line 1: "defgh" starts at 4, newline at index 9
// Line 2: "ij"    starts at 10 (last line, no trailing newline)
const lineStarts = [0, 4, 10]

describe('calculateNewCursorPosition', () => {
  describe('direction: up', () => {
    test('moves to the same column on the previous line', () => {
      // cursor at index 5 ('e' in "defgh"), column 1 within that line
      const result = calculateNewCursorPosition({
        cursorPosition: 5,
        lineStarts,
        cursorIsChar: true,
        direction: 'up',
        desiredIndex: 1,
      })
      // column 1 on line 0 ("abc") is index 1
      expect(result).toBe(1)
    })

    test('clamps to the end of the previous line when the desired column overshoots', () => {
      const result = calculateNewCursorPosition({
        cursorPosition: 5,
        lineStarts,
        cursorIsChar: true,
        direction: 'up',
        desiredIndex: 10,
      })
      // previous line ("abc") ends (exclusive of the newline) at index 3
      expect(result).toBe(3)
    })

    test('returns 0 when already on the first line', () => {
      const result = calculateNewCursorPosition({
        cursorPosition: 1,
        lineStarts,
        cursorIsChar: true,
        direction: 'up',
        desiredIndex: 2,
      })
      expect(result).toBe(0)
    })
  })

  describe('direction: down', () => {
    test('moves to the same column on the next line', () => {
      // cursor at index 1 ('b' in "abc"), column 1 within that line
      const result = calculateNewCursorPosition({
        cursorPosition: 1,
        lineStarts,
        cursorIsChar: true,
        direction: 'down',
        desiredIndex: 2,
      })
      // column 2 on line 1 ("defgh") is index 4 + 2 = 6
      expect(result).toBe(6)
    })

    test('clamps to the end of the next line when the desired column overshoots', () => {
      const result = calculateNewCursorPosition({
        cursorPosition: 1,
        lineStarts,
        cursorIsChar: true,
        direction: 'down',
        desiredIndex: 99,
      })
      // next line ("defgh") ends (exclusive of the newline) at index 9
      expect(result).toBe(9)
    })

    test('returns Infinity when already on the last line', () => {
      const result = calculateNewCursorPosition({
        cursorPosition: 10,
        lineStarts,
        cursorIsChar: true,
        direction: 'down',
        desiredIndex: 0,
      })
      expect(result).toBe(Infinity)
    })

    test('moves onto the next line without clamping when a line after it still exists', () => {
      // cursor on line 0, moving down to line 1; line 2 exists after it, so the next-line-start
      // lookup is defined and the desired column is used as-is
      const result = calculateNewCursorPosition({
        cursorPosition: 0,
        lineStarts,
        cursorIsChar: true,
        direction: 'down',
        desiredIndex: 3,
      })
      // desiredIndex fits within line 1 ("defgh" has length 5), so no clamping needed
      expect(result).toBe(7)
    })

    test('has no length constraint when the destination is the last line', () => {
      // cursor on line 1, moving down to line 2, which is the last line: there's no line after
      // it, so the lookup one line past the destination is undefined and falls back to Infinity
      const result = calculateNewCursorPosition({
        cursorPosition: 5,
        lineStarts,
        cursorIsChar: true,
        direction: 'down',
        desiredIndex: 99,
      })
      // line 2 starts at 10 with no upper bound, so the desired column is used unclamped
      expect(result).toBe(109)
    })
  })

  test('throws for an invalid direction', () => {
    expect(() =>
      calculateNewCursorPosition({
        cursorPosition: 0,
        lineStarts,
        cursorIsChar: true,
        // @ts-expect-error testing runtime guard against an invalid value
        direction: 'sideways',
        desiredIndex: 0,
      }),
    ).toThrow('Invalid direction: sideways')
  })
})
