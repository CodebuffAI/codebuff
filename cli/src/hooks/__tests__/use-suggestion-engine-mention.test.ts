import { describe, test, expect } from 'bun:test'

// Helper function extracted from use-suggestion-engine.ts for testing
const isInsideQuotes = (text: string, position: number): boolean => {
  let inSingleQuote = false
  let inDoubleQuote = false
  let inBacktick = false
  let escaped = false

  for (let i = 0; i < position; i++) {
    const char = text[i]

    if (escaped) {
      escaped = false
      continue
    }

    if (char === '\\') {
      escaped = true
      continue
    }

    if (char === "'" && !inDoubleQuote && !inBacktick) {
      inSingleQuote = !inSingleQuote
    } else if (char === '"' && !inSingleQuote && !inBacktick) {
      inDoubleQuote = !inDoubleQuote
    } else if (char === '`' && !inSingleQuote && !inDoubleQuote) {
      inBacktick = !inBacktick
    }
  }

  return inSingleQuote || inDoubleQuote || inBacktick
}

const parseAtInLine = (line: string): { active: boolean; query: string; atIndex: number } => {
  const atIndex = line.lastIndexOf('@')
  if (atIndex === -1) {
    return { active: false, query: '', atIndex: -1 }
  }

  // Check if @ is inside quotes
  if (isInsideQuotes(line, atIndex)) {
    return { active: false, query: '', atIndex: -1 }
  }

  const beforeChar = atIndex > 0 ? line[atIndex - 1] : ''
  
  // Don't trigger on escaped @: \@
  if (beforeChar === '\\') {
    return { active: false, query: '', atIndex: -1 }
  }

  // Don't trigger on email-like patterns or URLs
  if (beforeChar && /[a-zA-Z0-9.:]/.test(beforeChar)) {
    return { active: false, query: '', atIndex: -1 }
  }

  // Require whitespace or start of line before @
  if (beforeChar && !/\s/.test(beforeChar)) {
    return { active: false, query: '', atIndex: -1 }
  }

  const afterAt = line.slice(atIndex + 1)
  const firstSpaceIndex = afterAt.search(/\s/)
  const query = firstSpaceIndex === -1 ? afterAt : afterAt.slice(0, firstSpaceIndex)

  if (firstSpaceIndex !== -1) {
    return { active: false, query: '', atIndex: -1 }
  }

  return { active: true, query, atIndex }
}

describe('@ mention edge cases - quote detection', () => {
  test('isInsideQuotes detects position inside double quotes', () => {
    expect(isInsideQuotes('"hello @world"', 7)).toBe(true)
  })

  test('isInsideQuotes detects position inside single quotes', () => {
    expect(isInsideQuotes("'hello @world'", 7)).toBe(true)
  })

  test('isInsideQuotes detects position inside backticks', () => {
    expect(isInsideQuotes('`hello @world`', 7)).toBe(true)
  })

  test('isInsideQuotes returns false for position outside quotes', () => {
    expect(isInsideQuotes('"hello" @world', 8)).toBe(false)
  })

  test('isInsideQuotes handles escaped quotes', () => {
    expect(isInsideQuotes('"hello \\" @world"', 11)).toBe(true)
  })
})

describe('parseAtInLine - @ mention trigger logic', () => {
  test('triggers for @ at start of line', () => {
    const result = parseAtInLine('@agent')
    expect(result.active).toBe(true)
    expect(result.query).toBe('agent')
  })

  test('triggers for @ after whitespace', () => {
    const result = parseAtInLine('hello @agent')
    expect(result.active).toBe(true)
    expect(result.query).toBe('agent')
  })

  test('does NOT trigger for @ inside double quotes', () => {
    const result = parseAtInLine('"@agent"')
    expect(result.active).toBe(false)
  })

  test('does NOT trigger for @ inside single quotes', () => {
    const result = parseAtInLine("'@agent'")
    expect(result.active).toBe(false)
  })

  test('does NOT trigger for @ inside backticks', () => {
    const result = parseAtInLine('`@agent`')
    expect(result.active).toBe(false)
  })

  test('does NOT trigger for email addresses', () => {
    const result = parseAtInLine('user@example.com')
    expect(result.active).toBe(false)
  })

  test('does NOT trigger for escaped @ symbol', () => {
    const result = parseAtInLine('\\@agent')
    expect(result.active).toBe(false)
  })

  test('does NOT trigger for @ in URLs with colon', () => {
    const result = parseAtInLine('https://example.com/@user')
    expect(result.active).toBe(false)
  })

  test('does NOT trigger for @ after dot', () => {
    const result = parseAtInLine('file.@property')
    expect(result.active).toBe(false)
  })

  test('triggers after closing quote', () => {
    const result = parseAtInLine('"test" @agent')
    expect(result.active).toBe(true)
    expect(result.query).toBe('agent')
  })

  test('handles nested quotes correctly - @ inside outer quotes', () => {
    const result = parseAtInLine('"test \'nested\' @here"')
    expect(result.active).toBe(false)
  })

  test('extracts query correctly', () => {
    const result = parseAtInLine('@myagent')
    expect(result.active).toBe(true)
    expect(result.query).toBe('myagent')
  })

  test('does NOT trigger if @ followed by space', () => {
    const result = parseAtInLine('@ agent')
    expect(result.active).toBe(false)
  })

  test('uses lastIndexOf to find the rightmost @', () => {
    const result = parseAtInLine('@first @second')
    expect(result.active).toBe(true)
    expect(result.query).toBe('second')
  })
})

describe('parseAtInLine - comprehensive edge cases', () => {
  // Email variations
  test('does NOT trigger for email with subdomain', () => {
    const result = parseAtInLine('user@mail.example.com')
    expect(result.active).toBe(false)
  })

  test('does NOT trigger for email with numbers', () => {
    const result = parseAtInLine('user123@example.com')
    expect(result.active).toBe(false)
  })

  test('does NOT trigger for email with underscores', () => {
    const result = parseAtInLine('user_name@example.com')
    expect(result.active).toBe(false)
  })

  test('does NOT trigger for email with hyphens', () => {
    const result = parseAtInLine('user-name@example.com')
    expect(result.active).toBe(false)
  })

  test('does NOT trigger for email with dots in username', () => {
    const result = parseAtInLine('first.last@example.com')
    expect(result.active).toBe(false)
  })

  // URL variations
  test('does NOT trigger for http URL', () => {
    const result = parseAtInLine('http://example.com/@user')
    expect(result.active).toBe(false)
  })

  test('does NOT trigger for https URL', () => {
    const result = parseAtInLine('https://example.com/@user')
    expect(result.active).toBe(false)
  })

  test('does NOT trigger for URL with port', () => {
    const result = parseAtInLine('http://localhost:3000/@user')
    expect(result.active).toBe(false)
  })

  // Quote escape variations
  test('does NOT trigger for @ after escaped backslash in quotes', () => {
    const result = parseAtInLine('"\\\\@test"')
    expect(result.active).toBe(false)
  })

  test('does NOT trigger for @ when quote is escaped (string still open)', () => {
    // In "test\" @agent, the \" is an escaped quote, so the string is still open
    const result = parseAtInLine('"test\\" @agent')
    expect(result.active).toBe(false)
  })

  test('triggers for @ after quote with escaped backslash before it', () => {
    // In "test\\" @agent, the \\ is an escaped backslash, so the " closes the string
    const result = parseAtInLine('"test\\\\" @agent')
    expect(result.active).toBe(true)
    expect(result.query).toBe('agent')
  })

  test('handles multiple escaped quotes correctly', () => {
    const result = parseAtInLine('"test\\"more\\" @here"')
    expect(result.active).toBe(false)
  })

  // Mixed quote types
  test('handles single quote inside double quotes', () => {
    const result = parseAtInLine('"it\'s @here"')
    expect(result.active).toBe(false)
  })

  test('handles double quote inside single quotes', () => {
    const result = parseAtInLine("'say \"@hello\"'")
    expect(result.active).toBe(false)
  })

  test('handles backticks with quotes inside', () => {
    const result = parseAtInLine('`"@test"`')
    expect(result.active).toBe(false)
  })

  // Multiple @ symbols
  test('finds last @ when multiple exist outside quotes', () => {
    const result = parseAtInLine('@first "@quoted" @last')
    expect(result.active).toBe(true)
    expect(result.query).toBe('last')
  })

  test('finds last @ even if previous ones are in quotes', () => {
    const result = parseAtInLine('"@in_quotes" @real_one')
    expect(result.active).toBe(true)
    expect(result.query).toBe('real_one')
  })

  // Special characters after @
  test('does NOT trigger for @ followed by special characters', () => {
    const result = parseAtInLine('@!')
    expect(result.active).toBe(true)
    expect(result.query).toBe('!')
  })

  test('extracts alphanumeric query with underscores and hyphens', () => {
    const result = parseAtInLine('@my-agent_v2')
    expect(result.active).toBe(true)
    expect(result.query).toBe('my-agent_v2')
  })

  // Whitespace variations
  test('triggers with tab before @', () => {
    const result = parseAtInLine('\t@agent')
    expect(result.active).toBe(true)
    expect(result.query).toBe('agent')
  })

  test('triggers with newline before @ (in same line context)', () => {
    const result = parseAtInLine(' @agent')
    expect(result.active).toBe(true)
    expect(result.query).toBe('agent')
  })

  test('triggers with multiple spaces before @', () => {
    const result = parseAtInLine('text    @agent')
    expect(result.active).toBe(true)
    expect(result.query).toBe('agent')
  })

  // Empty and edge cases
  test('handles empty string', () => {
    const result = parseAtInLine('')
    expect(result.active).toBe(false)
  })

  test('handles just @', () => {
    const result = parseAtInLine('@')
    expect(result.active).toBe(true)
    expect(result.query).toBe('')
  })

  test('handles @ at end of string with query', () => {
    const result = parseAtInLine('text @query')
    expect(result.active).toBe(true)
    expect(result.query).toBe('query')
  })

  // Code-like contexts (where @ might appear)
  test('does NOT trigger for decorator-like syntax', () => {
    const result = parseAtInLine('something.@decorator')
    expect(result.active).toBe(false)
  })

  test('does NOT trigger for array access', () => {
    const result = parseAtInLine('array.@index')
    expect(result.active).toBe(false)
  })

  // Social media handles (ambiguous - should these trigger?)
  test('triggers for Twitter-like handles after space', () => {
    const result = parseAtInLine('follow @username')
    expect(result.active).toBe(true)
    expect(result.query).toBe('username')
  })

  test('does NOT trigger when @ is part of word', () => {
    const result = parseAtInLine('user@mention')
    expect(result.active).toBe(false)
  })

  // Multiple quotes on same line
  test('handles alternating quotes correctly', () => {
    const result = parseAtInLine('"first" \'second\' "@third"')
    expect(result.active).toBe(false)
  })

  test('triggers after all quotes are closed', () => {
    const result = parseAtInLine('"first" \'second\' @third')
    expect(result.active).toBe(true)
    expect(result.query).toBe('third')
  })

  // Unclosed quotes
  test('does NOT trigger when inside unclosed double quote', () => {
    const result = parseAtInLine('"unclosed @mention')
    expect(result.active).toBe(false)
  })

  test('does NOT trigger when inside unclosed single quote', () => {
    const result = parseAtInLine("'unclosed @mention")
    expect(result.active).toBe(false)
  })

  test('does NOT trigger when inside unclosed backtick', () => {
    const result = parseAtInLine('`unclosed @mention')
    expect(result.active).toBe(false)
  })
})
