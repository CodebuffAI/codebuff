import { describe, test, expect } from 'bun:test'

import { fuzzyMatch } from '../fuzzy-match'

describe('fuzzyMatch', () => {
  describe('matching', () => {
    test('returns null when query is not a subsequence of text', () => {
      expect(fuzzyMatch('abc', 'xyz')).toBeNull()
      expect(fuzzyMatch('hello', 'hxllo')).toBeNull()
      // A query longer than the text is not a valid subsequence
      expect(fuzzyMatch('foo', 'fooo')).toBeNull()
    })

    test('matches exact text with zero gaps', () => {
      const result = fuzzyMatch('init', 'init')
      expect(result).not.toBeNull()
      expect(result!.indices).toEqual([0, 1, 2, 3])
    })

    test('matches prefix subsequence', () => {
      // 'command' = c(0)o(1)m(2)m(3)a(4)n(5)d(6); 'cmd' -> c(0),m(2),d(6)
      const result = fuzzyMatch('command', 'cmd')
      expect(result).not.toBeNull()
      expect(result!.indices).toEqual([0, 2, 6])
    })

    test('matches with gaps (subsequence)', () => {
      // 'src/components/button.tsx': b(15)u(16)t(17)t(18)o(19)n(20)
      // 'btn' -> b(15), t(17), n(20)
      const result = fuzzyMatch('src/components/button.tsx', 'btn')
      expect(result).not.toBeNull()
      expect(result!.indices).toEqual([15, 17, 20])
    })

    test('is case-insensitive', () => {
      const upper = fuzzyMatch('Init', 'init')
      const lower = fuzzyMatch('init', 'INIT')
      expect(upper).not.toBeNull()
      expect(lower).not.toBeNull()
      expect(upper!.indices).toEqual(lower!.indices)
    })

    test('empty query matches with empty indices', () => {
      const result = fuzzyMatch('anything', '')
      expect(result).not.toBeNull()
      expect(result!.indices).toEqual([])
    })
  })

  describe('scoring (lower is better)', () => {
    test('exact match scores better than gappy match', () => {
      const exact = fuzzyMatch('cmd', 'cmd')!
      const gappy = fuzzyMatch('command', 'cmd')!
      expect(exact.score).toBeLessThan(gappy.score)
    })

    test('prefix match scores better than mid-string match', () => {
      const prefix = fuzzyMatch('component', 'comp')!
      const mid = fuzzyMatch('recompose', 'comp')!
      expect(prefix.score).toBeLessThan(mid.score)
    })

    test('consecutive matches score better than fragmented matches', () => {
      // "abc" in "XabcY" is consecutive; "abc" in "aXbYc" is fragmented.
      const consecutive = fuzzyMatch('XabcY', 'abc')!
      const fragmented = fuzzyMatch('aXbYc', 'abc')!
      expect(consecutive.score).toBeLessThan(fragmented.score)
    })

    test('word-boundary matches (after /) score better than mid-word', () => {
      // "btn" after a slash boundary should beat "btn" mid-word at same position.
      const boundary = fuzzyMatch('src/btn', 'btn')!
      const midWord = fuzzyMatch('rebtn', 'btn')!
      expect(boundary.score).toBeLessThan(midWord.score)
    })

    test('earlier first match scores better (later start is penalized)', () => {
      const early = fuzzyMatch('cmd-early', 'cmd')!
      const late = fuzzyMatch('xxxcmd-late', 'cmd')!
      expect(early.score).toBeLessThan(late.score)
    })

    test('returns a numeric score', () => {
      const result = fuzzyMatch('hello', 'hlo')
      expect(result).not.toBeNull()
      expect(typeof result!.score).toBe('number')
    })

    test('indices are strictly increasing', () => {
      const result = fuzzyMatch('a/b/c/d.tsx', 'abc')
      expect(result).not.toBeNull()
      const indices = result!.indices
      for (let i = 1; i < indices.length; i++) {
        expect(indices[i]).toBeGreaterThan(indices[i - 1])
      }
    })
  })

  describe('edge cases', () => {
    test('handles single-character text', () => {
      expect(fuzzyMatch('a', 'a')).not.toBeNull()
      expect(fuzzyMatch('a', 'b')).toBeNull()
    })

    test('handles text with special characters', () => {
      const result = fuzzyMatch('src/utils/fuzzy-match.ts', 'fzm')
      expect(result).not.toBeNull()
    })

    test('query longer than text returns null', () => {
      expect(fuzzyMatch('ab', 'abc')).toBeNull()
    })

    test('repeated characters in query match forward only', () => {
      // "ll" in "hello" matches the two consecutive l's
      const result = fuzzyMatch('hello', 'll')
      expect(result).not.toBeNull()
      expect(result!.indices).toEqual([2, 3])
    })
  })
})
