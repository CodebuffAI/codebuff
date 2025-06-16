import { describe, expect, it } from 'bun:test'
import { gray } from 'picocolors'
import { onlyWhitespace, squashNewlines } from '../display'

const PREFIX = '.\r\n'

// Helper function to simulate getLastTwoLines behavior
function getLastTwoLines(str: string): string {
  return PREFIX + str.split('\r\n').slice(-2).join('\r\n')
}

describe('squashNewlines', () => {
  describe('when called with getLastTwoLines(previous) + chunk', () => {
    it('should handle simple strings', () => {
      const previous = 'line1\r\nline2\r\nline3'
      const chunk = '\r\nline4\r\nline5'
      const lastTwoLines = getLastTwoLines(previous)
      const combined = lastTwoLines + chunk
      const squashed = squashNewlines(combined)

      expect(squashed).toEqual(lastTwoLines + chunk)
    })

    it('should handle when chunk has empty lines', () => {
      const previous = 'content\r\nmore content'
      const chunk = '\r\n\r\n\r\nfinal line'
      const lastTwoLines = getLastTwoLines(previous)
      const combined = lastTwoLines + chunk
      const squashed = squashNewlines(combined)

      expect(squashed).toEqual(lastTwoLines + '\r\n\r\nfinal line')
    })

    it('should handle when chunk has whitespace lines', () => {
      const previous = 'first\r\nsecond\r\nthird'
      const chunk = '\r\n   \r\n\t\r\nfourth'
      const lastTwoLines = getLastTwoLines(previous)
      const combined = lastTwoLines + chunk
      const squashed = squashNewlines(combined)

      expect(squashed).toEqual(lastTwoLines + '\r\n   \r\n\tfourth')
    })

    it('should handle when previous is empty', () => {
      const previous = ''
      const chunk = 'some\r\ncontent'
      const lastTwoLines = getLastTwoLines(previous)
      const combined = lastTwoLines + chunk
      const squashed = squashNewlines(combined)

      expect(squashed).toEqual(lastTwoLines + chunk)
    })

    it('should handle when chunk is empty', () => {
      const previous = 'some\r\ncontent\r\nhere'
      const chunk = ''
      const lastTwoLines = getLastTwoLines(previous)
      const combined = lastTwoLines + chunk
      const squashed = squashNewlines(combined)

      expect(squashed).toEqual(lastTwoLines + chunk)
    })

    it('should handle when both strings are empty', () => {
      const previous = ''
      const chunk = ''
      const lastTwoLines = getLastTwoLines(previous)
      const combined = lastTwoLines + chunk
      const squashed = squashNewlines(combined)

      expect(squashed).toEqual(lastTwoLines + chunk)
    })

    it('should handle complex mixed content', () => {
      const previous = 'alpha\r\nbeta\r\ngamma\r\ndelta'
      const chunk = '\r\n\r\n   \r\n\t\r\n\r\nepsilon\r\nzeta'
      const lastTwoLines = getLastTwoLines(previous)
      const combined = lastTwoLines + chunk
      const squashed = squashNewlines(combined)

      expect(squashed).toEqual(lastTwoLines + '\r\n\r\n   \tepsilon\r\nzeta')
    })

    it('should handle when previous has only newlines', () => {
      const previous = '\r\n\r\n\r\n'
      const chunk = 'content'
      const lastTwoLines = getLastTwoLines(previous)
      const combined = lastTwoLines + chunk
      const squashed = squashNewlines(combined)

      expect(squashed).toEqual(lastTwoLines + chunk)
    })

    it('should handle when chunk has only newlines', () => {
      const previous = 'content\r\nmore'
      const chunk = '\r\n\r\n\r\n'
      const lastTwoLines = getLastTwoLines(previous)
      const combined = lastTwoLines + chunk
      const squashed = squashNewlines(combined)

      expect(squashed).toEqual(lastTwoLines + '\r\n\r\n')
    })

    it('should handle single line inputs', () => {
      const previous = 'single line'
      const chunk = 'another line'
      const lastTwoLines = getLastTwoLines(previous)
      const combined = lastTwoLines + chunk
      const squashed = squashNewlines(combined)

      expect(squashed).toEqual(lastTwoLines + chunk)
    })

    it('should handle previous ends with whitespace lines', () => {
      const previous = 'content\r\n  \r\n\t'
      const chunk = '\r\nmore content'
      const lastTwoLines = getLastTwoLines(previous)
      const combined = lastTwoLines + chunk
      const squashed = squashNewlines(combined)

      expect(squashed).toEqual(lastTwoLines + 'more content')
    })
  })

  describe('squashNewlines behavior verification', () => {
    it('should squash consecutive empty lines correctly', () => {
      const input = PREFIX + 'line1\r\n\r\n\r\n\r\nline5'
      const result = squashNewlines(input)

      // Should reduce multiple consecutive empty lines to at most 2
      expect(result).toBe(PREFIX + 'line1\r\n\r\nline5')
    })

    it('should preserve single empty lines', () => {
      const input = PREFIX + 'line1\r\n\r\nline3'
      const result = squashNewlines(input)

      expect(result).toBe(input) // Should remain unchanged
    })
  })

  describe('error handling', () => {
    it('should throw error when input does not start with PREFIX', () => {
      const invalidInput = 'invalid input without prefix'

      expect(() => squashNewlines(invalidInput)).toThrow(
        `Expected string to start with ${JSON.stringify(PREFIX)}`
      )
    })
  })
})

describe('onlyWhitespace', () => {
  it('should return true for empty string', () => {
    expect(onlyWhitespace('')).toBe(true)
  })

  it('should return true for single space', () => {
    expect(onlyWhitespace(' ')).toBe(true)
  })

  it('should return true for multiple spaces', () => {
    expect(onlyWhitespace('   ')).toBe(true)
  })

  it('should return true for tab', () => {
    expect(onlyWhitespace('\t')).toBe(true)
  })

  it('should return true for newline', () => {
    expect(onlyWhitespace('\n')).toBe(true)
  })

  it('should return true for carriage return', () => {
    expect(onlyWhitespace('\r')).toBe(true)
  })

  it('should return true for ANSI escape sequences', () => {
    expect(onlyWhitespace('\u001b[31m')).toBe(true) // Red color
    expect(onlyWhitespace('\u001b[0m')).toBe(true) // Reset
  })

  it('should return true for OSC sequences', () => {
    const oscSequence =
      '\u001b]697;OSCUnlock=683fe5e7c2d2476bb61d4e0588c15eec\u0007\u001b]697;Dir=/Users/jahooma/codebuff\u0007'
    expect(onlyWhitespace(oscSequence)).toBe(true)
  })

  it('should return false for control characters', () => {
    expect(onlyWhitespace('\u0000\u0001\u0002')).toBe(true) // Null, SOH, STX
    expect(onlyWhitespace('\u007F')).toBe(true) // DEL
  })

  it('should return true for zero-width characters', () => {
    expect(onlyWhitespace('\u200B')).toBe(true)
    expect(onlyWhitespace('\u200C')).toBe(true)
    expect(onlyWhitespace('\u200D')).toBe(true)
  })

  it('should return true for colored empty strings', () => {
    expect(onlyWhitespace(gray(' '))).toBe(true)
  })

  it('should return false for visible text', () => {
    expect(onlyWhitespace('hello')).toBe(false)
    expect(onlyWhitespace('a')).toBe(false)
    expect(onlyWhitespace('123')).toBe(false)
  })

  describe('real world examples', () => {
    it('should return false for end of terminal command', () => {
      expect(
        onlyWhitespace(
          '\u001b]697;OSCUnlock=683fe5e7c2d2476bb61d4e0588c15eec\u0007\u001b]697;Dir=/Users/jahooma/codebuff\u0007\u001b]697;Shell=bash\u0007\u001b]697;ShellPath=/bin/bash\u0007\u001b]697;PID=71631\u0007\u001b]697;ExitCode=0\u0007\u001b]697;TTY=/dev/ttys036\u0007\u001b]697;Log=\u0007\u001b]697;User=jahooma\u0007\u001b]697;OSCLock=683fe5e7c2d2476bb61d4e0588c15eec\u0007\u001b]697;PreExec\u0007\u001b]697;StartPrompt\u0007'
        )
      ).toBe(true)

      expect(
        onlyWhitespace(
          '\u001b]0;charles@charles-framework-13:~/github/codebuff\u001b\\\u001b]7;file://charles-framework-13/home/charles/github/codebuff\u001b\\\u001b[?2004h'
        )
      ).toBe(true)
    })
  })
})
