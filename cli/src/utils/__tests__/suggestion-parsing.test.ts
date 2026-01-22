import { describe, it, expect } from 'bun:test'

import {
  parseSlashContext,
  parseMentionContext,
  parseAtInLine,
  isInsideStringDelimiters,
} from '../suggestion-parsing'

/**
 * These tests focus on DOMAIN LOGIC that could break if the implementation changes.
 * Low-value tests that just verify JavaScript built-in behavior have been removed.
 */

describe('parseSlashContext', () => {
  describe('first line only rule (business logic)', () => {
    it('should activate slash command at position 0', () => {
      const result = parseSlashContext('/help')
      expect(result).toEqual({ active: true, query: 'help', startIndex: 0 })
    })

    it('should NOT activate slash command on second line', () => {
      const result = parseSlashContext('first line\n/help')
      expect(result).toEqual({ active: false, query: '', startIndex: -1 })
    })

    it('should NOT activate slash command with leading whitespace', () => {
      // This is a key business rule - leading whitespace means startIndex > 0
      const result = parseSlashContext('  /help')
      expect(result).toEqual({ active: false, query: '', startIndex: -1 })
    })

    it('should NOT activate slash command in middle of text', () => {
      const result = parseSlashContext('some text /help')
      expect(result).toEqual({ active: false, query: '', startIndex: -1 })
    })
  })

  describe('query parsing edge cases', () => {
    it('should MATCH path-like input - regex allows any non-whitespace after slash', () => {
      // The regex [^\s]* allows any non-whitespace chars including slashes
      // This is intentional - /path/to/file is a valid slash command query
      const result = parseSlashContext('/path/to/file')
      expect(result).toEqual({ active: true, query: 'path/to/file', startIndex: 0 })
    })

    it('should NOT activate if slash is followed by space', () => {
      const result = parseSlashContext('/ help')
      expect(result).toEqual({ active: false, query: '', startIndex: -1 })
    })

    it('should handle slash with special characters in query', () => {
      // The regex [^\s]* allows any non-whitespace chars
      const result = parseSlashContext('/test-command_123')
      expect(result).toEqual({ active: true, query: 'test-command_123', startIndex: 0 })
    })

    it('should stop at whitespace in query', () => {
      // Only first word after slash should be captured
      const result = parseSlashContext('/help extra')
      expect(result).toEqual({ active: false, query: '', startIndex: -1 })
    })
  })
})

describe('isInsideStringDelimiters', () => {
  describe('escape sequence counting (tricky logic)', () => {
    it('should recognize escaped quote inside string', () => {
      // "say \"hello\"" - the inner quotes are escaped
      // At position 5 (after first escaped quote), still inside
      expect(isInsideStringDelimiters('"say \\"hello\\""', 5)).toBe(true)
    })

    it('should recognize when two backslashes mean quote is NOT escaped', () => {
      // "\\" - two backslashes, then quote. The first \ escapes the second, so " closes the string
      // String literal '"\\\\"' = actual string: "\\", which is: quote, backslash, backslash, quote
      // Position 4 is after the closing quote (position 3 is still inside)
      expect(isInsideStringDelimiters('"\\\\"', 4)).toBe(false)
    })

    it('should recognize when one backslash means quote IS escaped', () => {
      // "\"" - one backslash, then quote. The quote is escaped, string is still open
      // String literal '"\\""' = actual string: "\", which is: quote, backslash, quote
      // Position 3 - we're still inside because the second quote was escaped
      expect(isInsideStringDelimiters('"\\""', 3)).toBe(true)
    })

    it('should handle complex nested escaping', () => {
      // "he said \"hello\"" - escaped quotes inside
      const str = '"he said \\"hello\\""'
      // Position in middle should be true (inside outer quotes)
      expect(isInsideStringDelimiters(str, 10)).toBe(true)
      // Position after closing quote should be false
      expect(isInsideStringDelimiters(str, str.length)).toBe(false)
    })
  })

  describe('delimiter nesting behavior', () => {
    it('should not toggle on double quote when inside backticks', () => {
      // `"hello"` - double quotes inside backticks don't change state
      expect(isInsideStringDelimiters('`"hello"@', 8)).toBe(true)
    })

    it('should not toggle on backtick when inside double quotes', () => {
      // "`code`" - backticks inside double quotes don't change state
      expect(isInsideStringDelimiters('"`code`@', 7)).toBe(true)
    })

    it('should handle unclosed double quote', () => {
      // "hello - unclosed, any position after opening is inside
      expect(isInsideStringDelimiters('"hello', 5)).toBe(true)
      expect(isInsideStringDelimiters('"hello', 1)).toBe(true)
    })

    it('should handle unclosed backtick', () => {
      // `code - unclosed
      expect(isInsideStringDelimiters('`code', 4)).toBe(true)
    })

    it('should return false for position after properly closed quotes', () => {
      expect(isInsideStringDelimiters('"hello" @', 8)).toBe(false)
      expect(isInsideStringDelimiters('`code` @', 7)).toBe(false)
    })
  })

  describe('single quotes are NOT delimiters (apostrophe rule)', () => {
    it('should NOT treat single quotes as string delimiters', () => {
      // This is intentional - single quotes are often apostrophes
      expect(isInsideStringDelimiters("don't @mention", 6)).toBe(false)
      expect(isInsideStringDelimiters("it's @working", 5)).toBe(false)
    })
  })
})

describe('parseAtInLine', () => {
  describe('email-like pattern detection (complex heuristic)', () => {
    it('should NOT trigger for standard email', () => {
      expect(parseAtInLine('user@example.com')).toEqual({ active: false, query: '', atIndex: -1 })
    })

    it('should NOT trigger for email with subdomain', () => {
      expect(parseAtInLine('name@mail.example.com')).toEqual({ active: false, query: '', atIndex: -1 })
    })

    it('should NOT trigger for URL with @ in path', () => {
      expect(parseAtInLine('https://example.com/@user')).toEqual({ active: false, query: '', atIndex: -1 })
    })

    it('should NOT trigger when preceded by dot', () => {
      // file.@ext - dot before @ suggests URL/email-like
      expect(parseAtInLine('file.@ext')).toEqual({ active: false, query: '', atIndex: -1 })
    })

    it('should NOT trigger when preceded by colon', () => {
      // scheme:@path - colon before @ suggests URL-like
      expect(parseAtInLine('scheme:@path')).toEqual({ active: false, query: '', atIndex: -1 })
    })
  })

  describe('multiple @ handling (uses lastIndexOf)', () => {
    it('should trigger on last @ when first is email-like', () => {
      // user@example.com @mention - first is email, second is valid mention
      const result = parseAtInLine('user@example.com @mention')
      expect(result).toEqual({ active: true, query: 'mention', atIndex: 17 })
    })

    it('should use last @ when multiple valid mentions exist', () => {
      const result = parseAtInLine('@first @second')
      expect(result).toEqual({ active: true, query: 'second', atIndex: 7 })
    })

    it('should handle double @@ - second @ has @ before it (non-whitespace)', () => {
      // @@user - the second @ has @ before it, which is not whitespace or alphanumeric
      // According to the code, if beforeChar is not whitespace, it returns inactive
      const result = parseAtInLine('@@user')
      expect(result).toEqual({ active: false, query: '', atIndex: -1 })
    })
  })

  describe('whitespace requirement before @', () => {
    it('should trigger at start of line (no preceding char)', () => {
      expect(parseAtInLine('@user')).toEqual({ active: true, query: 'user', atIndex: 0 })
    })

    it('should trigger after space', () => {
      expect(parseAtInLine('hello @user')).toEqual({ active: true, query: 'user', atIndex: 6 })
    })

    it('should trigger after tab', () => {
      expect(parseAtInLine('hello\t@user')).toEqual({ active: true, query: 'user', atIndex: 6 })
    })

    it('should NOT trigger after non-whitespace punctuation', () => {
      // Implementation requires whitespace, not just non-alphanumeric
      expect(parseAtInLine('(@user')).toEqual({ active: false, query: '', atIndex: -1 })
      expect(parseAtInLine('[@user')).toEqual({ active: false, query: '', atIndex: -1 })
    })

    it('should trigger after whitespace following punctuation', () => {
      expect(parseAtInLine('( @user')).toEqual({ active: true, query: 'user', atIndex: 2 })
    })
  })

  describe('escaped @ handling', () => {
    it('should NOT trigger for escaped @', () => {
      expect(parseAtInLine('\\@user')).toEqual({ active: false, query: '', atIndex: -1 })
    })

    it('should NOT trigger for escaped @ in middle of text', () => {
      expect(parseAtInLine('hello \\@user')).toEqual({ active: false, query: '', atIndex: -1 })
    })
  })

  describe('@ inside string delimiters', () => {
    it('should NOT trigger for @ inside double quotes', () => {
      expect(parseAtInLine('"hello @user"')).toEqual({ active: false, query: '', atIndex: -1 })
    })

    it('should NOT trigger for @ inside backticks', () => {
      expect(parseAtInLine('`code @mention`')).toEqual({ active: false, query: '', atIndex: -1 })
    })

    it('should trigger for @ after closing quote with space', () => {
      expect(parseAtInLine('"quoted" @user')).toEqual({ active: true, query: 'user', atIndex: 9 })
    })
  })

  describe('query termination', () => {
    it('should NOT be active if @ is followed by space', () => {
      expect(parseAtInLine('@ user')).toEqual({ active: false, query: '', atIndex: -1 })
    })

    it('should NOT be active if query has trailing space', () => {
      expect(parseAtInLine('@user ')).toEqual({ active: false, query: '', atIndex: -1 })
    })

    it('should capture entire query when no space follows', () => {
      expect(parseAtInLine('hello @username123')).toEqual({ active: true, query: 'username123', atIndex: 6 })
    })
  })

  describe('unicode and special chars in query', () => {
    it('should handle unicode characters in username', () => {
      // The implementation uses slice() which handles unicode
      const result = parseAtInLine('@用户')
      expect(result).toEqual({ active: true, query: '用户', atIndex: 0 })
    })

    it('should handle emojis in username', () => {
      const result = parseAtInLine('@user👋')
      expect(result).toEqual({ active: true, query: 'user👋', atIndex: 0 })
    })
  })
})

describe('parseMentionContext', () => {
  describe('cursor position affects parsing (key feature)', () => {
    it('should use cursor to determine current line', () => {
      // Cursor on second line should only parse second line
      const result = parseMentionContext('line1\n@user', 11)
      expect(result).toEqual({ active: true, query: 'user', startIndex: 6 })
    })

    it('should truncate input at cursor position', () => {
      // '@username' with cursor at position 5 means only '@user' is considered
      const result = parseMentionContext('@username', 5)
      expect(result).toEqual({ active: true, query: 'user', startIndex: 0 })
    })

    it('should NOT detect @ from previous line', () => {
      // Cursor is on second line which has no @
      const result = parseMentionContext('@first\nsecond', 13)
      expect(result).toEqual({ active: false, query: '', startIndex: -1 })
    })

    it('should handle cursor exactly at @ position', () => {
      // Cursor at position 1 means we only see '@'
      const result = parseMentionContext('@user', 1)
      expect(result).toEqual({ active: true, query: '', startIndex: 0 })
    })

    it('should handle cursor between @ and username', () => {
      // Cursor at position 3 means we see '@us'
      const result = parseMentionContext('@user', 3)
      expect(result).toEqual({ active: true, query: 'us', startIndex: 0 })
    })
  })

  describe('multiline with startIndex calculation', () => {
    it('should calculate correct startIndex for @ on second line', () => {
      // 'first\n@mention' - @ is at index 6 in the full string
      const result = parseMentionContext('first\n@mention', 14)
      expect(result).toEqual({ active: true, query: 'mention', startIndex: 6 })
    })

    it('should calculate startIndex with multiple newlines', () => {
      // 'a\nb\nc\n@user' - @ is at index 6
      const result = parseMentionContext('a\nb\nc\n@user', 11)
      expect(result).toEqual({ active: true, query: 'user', startIndex: 6 })
    })

    it('should handle @ in middle of line on second line', () => {
      const result = parseMentionContext('line1\ntext @user', 16)
      expect(result).toEqual({ active: true, query: 'user', startIndex: 11 })
    })

    it('should handle multiple @ across lines, cursor on second', () => {
      const result = parseMentionContext('@first\n@second', 14)
      expect(result).toEqual({ active: true, query: 'second', startIndex: 7 })
    })
  })

  describe('integration with parseAtInLine rules', () => {
    it('should inherit email detection', () => {
      const result = parseMentionContext('user@example.com', 16)
      expect(result).toEqual({ active: false, query: '', startIndex: -1 })
    })

    it('should inherit escape handling', () => {
      const result = parseMentionContext('\\@user', 6)
      expect(result).toEqual({ active: false, query: '', startIndex: -1 })
    })

    it('should inherit string delimiter detection', () => {
      const result = parseMentionContext('"hello @user"', 12)
      expect(result).toEqual({ active: false, query: '', startIndex: -1 })
    })
  })

  describe('edge cases', () => {
    it('should handle tab as whitespace before @', () => {
      const result = parseMentionContext('\t@user', 6)
      expect(result).toEqual({ active: true, query: 'user', startIndex: 1 })
    })

    it('should handle very long input with @ near end', () => {
      const longText = 'a'.repeat(1000) + ' @user'
      const result = parseMentionContext(longText, longText.length)
      expect(result).toEqual({ active: true, query: 'user', startIndex: 1001 })
    })
  })
})
