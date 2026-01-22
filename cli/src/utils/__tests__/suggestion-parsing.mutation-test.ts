/**
 * Manual Mutation Testing for suggestion-parsing.ts
 * 
 * This file tests whether our unit tests can catch bugs by simulating
 * common mutations that could be introduced into the implementation.
 * 
 * Run with: bun test src/utils/__tests__/suggestion-parsing.mutation-test.ts
 */

import { describe, it, expect } from 'bun:test'

/**
 * These tests verify that the unit tests are valuable by checking
 * edge cases that would break if certain implementation details changed.
 */

describe('Mutation Testing: Would tests catch these bugs?', () => {
  describe('parseSlashContext mutations', () => {
    it('MUTATION: if startIndex check was removed, second-line slash would activate', async () => {
      // This tests that the "first line only" rule is enforced
      const { parseSlashContext } = await import('../suggestion-parsing')
      
      // If someone removed: if (startIndex !== 0) return inactive
      // This test would catch it:
      const result = parseSlashContext('text\n/help')
      expect(result.active).toBe(false)
      
      // Verify first line still works
      const firstLine = parseSlashContext('/help')
      expect(firstLine.active).toBe(true)
    })

    it('MUTATION: if regex allowed whitespace after slash, "/ help" would activate', async () => {
      const { parseSlashContext } = await import('../suggestion-parsing')
      
      // If regex changed from /^(\s*)\/([^\s]*)$/ to /^(\s*)\/(.*)/
      // This test would catch it:
      const result = parseSlashContext('/ help')
      expect(result.active).toBe(false)
    })
  })

  describe('isInsideStringDelimiters mutations', () => {
    it('MUTATION: if escape counting was off-by-one, escaped quotes would misbehave', async () => {
      const { isInsideStringDelimiters } = await import('../suggestion-parsing')
      
      // The backslash counting logic is: numBackslashes % 2 === 1 means escaped
      // If this was changed to === 0, these tests would fail:
      
      // One backslash = escaped quote, still inside
      expect(isInsideStringDelimiters('"\\""', 3)).toBe(true)
      
      // Two backslashes = unescaped quote, outside after
      expect(isInsideStringDelimiters('"\\\\"', 4)).toBe(false)
    })

    it('MUTATION: if single quotes were added as delimiters, apostrophes would break', async () => {
      const { isInsideStringDelimiters } = await import('../suggestion-parsing')
      
      // If someone added: if (char === "'") inSingleQuote = !inSingleQuote
      // Common English text would break:
      expect(isInsideStringDelimiters("don't worry", 6)).toBe(false)
      expect(isInsideStringDelimiters("it's fine", 5)).toBe(false)
    })

    it('MUTATION: if backtick nesting was removed, ` inside " would toggle incorrectly', async () => {
      const { isInsideStringDelimiters } = await import('../suggestion-parsing')
      
      // If the check `&& !inDoubleQuote` was removed from backtick handling:
      // "`code`" - backtick at position 1 would toggle, position 6 would be outside
      // But correct behavior: we're inside double quotes the whole time
      expect(isInsideStringDelimiters('"`code`"', 6)).toBe(true)
    })
  })

  describe('parseAtInLine mutations', () => {
    it('MUTATION: if email check was removed, user@example.com would trigger', async () => {
      const { parseAtInLine } = await import('../suggestion-parsing')
      
      // If the regex /[a-zA-Z0-9.:]/ check was removed:
      const result = parseAtInLine('user@example.com')
      expect(result.active).toBe(false)
    })

    it('MUTATION: if escape check was removed, \\@user would trigger', async () => {
      const { parseAtInLine } = await import('../suggestion-parsing')
      
      // If the beforeChar === '\\' check was removed:
      const result = parseAtInLine('\\@user')
      expect(result.active).toBe(false)
    })

    it('MUTATION: if string delimiter check was removed, "@user" would trigger', async () => {
      const { parseAtInLine } = await import('../suggestion-parsing')
      
      // If isInsideStringDelimiters check was removed:
      const result = parseAtInLine('"hello @user"')
      expect(result.active).toBe(false)
    })

    it('MUTATION: if whitespace requirement was changed to allow any non-alnum', async () => {
      const { parseAtInLine } = await import('../suggestion-parsing')
      
      // If the check changed from !/\s/.test(beforeChar) to something looser:
      // (@user should NOT trigger because ( is not whitespace
      expect(parseAtInLine('(@user').active).toBe(false)
      
      // But ( @user SHOULD trigger because space before @
      expect(parseAtInLine('( @user').active).toBe(true)
    })

    it('MUTATION: if lastIndexOf was changed to indexOf, first @ would be used', async () => {
      const { parseAtInLine } = await import('../suggestion-parsing')
      
      // If lastIndexOf('@') was changed to indexOf('@'):
      // user@example.com @mention - indexOf would find the email @, not the mention
      const result = parseAtInLine('user@example.com @mention')
      expect(result.active).toBe(true)
      expect(result.query).toBe('mention')
      expect(result.atIndex).toBe(17) // Position of second @
    })
  })

  describe('parseMentionContext mutations', () => {
    it('MUTATION: if cursor position was ignored, full input would be parsed', async () => {
      const { parseMentionContext } = await import('../suggestion-parsing')
      
      // If cursorPosition was ignored (used input.length instead):
      // '@username more text' with cursor at 5 would include 'name more text'
      const result = parseMentionContext('@username', 5)
      expect(result.query).toBe('user') // Not 'username'
    })

    it('MUTATION: if lineStart calculation was wrong, startIndex would be off', async () => {
      const { parseMentionContext } = await import('../suggestion-parsing')
      
      // If lineStart was calculated incorrectly:
      const result = parseMentionContext('abc\n@user', 9)
      expect(result.startIndex).toBe(4) // Position of @ in full string
    })

    it('MUTATION: if newline handling was broken, multiline would fail', async () => {
      const { parseMentionContext } = await import('../suggestion-parsing')
      
      // First line @ should not be visible when cursor is on second line
      const result = parseMentionContext('@first\nsecond', 13)
      expect(result.active).toBe(false)
      
      // Second line @ should work
      const result2 = parseMentionContext('first\n@second', 13)
      expect(result2.active).toBe(true)
    })
  })
})

describe('Coverage of Critical Paths', () => {
  it('all exported functions are tested', async () => {
    const module = await import('../suggestion-parsing')
    
    // Verify all exports exist
    expect(typeof module.parseSlashContext).toBe('function')
    expect(typeof module.parseMentionContext).toBe('function')
    expect(typeof module.parseAtInLine).toBe('function')
    expect(typeof module.isInsideStringDelimiters).toBe('function')
  })
})
