export interface TriggerContext {
  active: boolean
  query: string
  startIndex: number
}

interface LineInfo {
  lineStart: number
  line: string
}

interface MentionParseResult {
  active: boolean
  query: string
  atIndex: number
}

const getCurrentLineInfo = (
  input: string,
  cursorPosition?: number,
): LineInfo => {
  const upto = cursorPosition ?? input.length
  const textUpTo = input.slice(0, upto)
  const lastNewline = textUpTo.lastIndexOf('\n')
  const lineStart = lastNewline === -1 ? 0 : lastNewline + 1
  const line = textUpTo.slice(lineStart)
  return { lineStart, line }
}

export const parseSlashContext = (input: string): TriggerContext => {
  if (!input) {
    return { active: false, query: '', startIndex: -1 }
  }

  const { lineStart, line } = getCurrentLineInfo(input)

  const match = line.match(/^(\s*)\/([^\s]*)$/)
  if (!match) {
    return { active: false, query: '', startIndex: -1 }
  }

  const [, leadingWhitespace, commandSegment] = match
  const startIndex = lineStart + leadingWhitespace.length

  // Slash commands only activate on the first line (startIndex must be 0)
  if (startIndex !== 0) {
    return { active: false, query: '', startIndex: -1 }
  }

  return { active: true, query: commandSegment, startIndex }
}

// Helper to check if a position is inside string delimiters (double quotes or backticks only)
// Single quotes are excluded because they're commonly used as apostrophes (don't, it's, etc.)
export const isInsideStringDelimiters = (text: string, position: number): boolean => {
  let inDoubleQuote = false
  let inBacktick = false

  for (let i = 0; i < position; i++) {
    const char = text[i]
    
    // Check if this character is escaped by counting preceding backslashes
    let numBackslashes = 0
    let j = i - 1
    while (j >= 0 && text[j] === '\\') {
      numBackslashes++
      j--
    }
    
    // If there's an odd number of backslashes, the character is escaped
    const isEscaped = numBackslashes % 2 === 1

    if (!isEscaped) {
      if (char === '"' && !inBacktick) {
        inDoubleQuote = !inDoubleQuote
      } else if (char === '`' && !inDoubleQuote) {
        inBacktick = !inBacktick
      }
    }
  }

  return inDoubleQuote || inBacktick
}

export const parseAtInLine = (line: string): MentionParseResult => {
  const atIndex = line.lastIndexOf('@')
  if (atIndex === -1) {
    return { active: false, query: '', atIndex: -1 }
  }

  // Check if @ is inside string delimiters
  if (isInsideStringDelimiters(line, atIndex)) {
    return { active: false, query: '', atIndex: -1 }
  }

  const beforeChar = atIndex > 0 ? line[atIndex - 1] : ''
  
  // Don't trigger on escaped @: \@
  if (beforeChar === '\\') {
    return { active: false, query: '', atIndex: -1 }
  }

  // Don't trigger on email-like patterns or URLs: user@example.com, https://example.com/@user
  // Check for alphanumeric, dot, or colon before @
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

export const parseMentionContext = (
  input: string,
  cursorPosition: number,
): TriggerContext => {
  if (!input) {
    return { active: false, query: '', startIndex: -1 }
  }

  const { lineStart, line } = getCurrentLineInfo(input, cursorPosition)
  const { active, query, atIndex } = parseAtInLine(line)

  if (!active) {
    return { active: false, query: '', startIndex: -1 }
  }

  const startIndex = lineStart + atIndex

  return { active: true, query, startIndex }
}
