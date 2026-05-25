/**
 * Formats code search output to group matches by file.
 *
 * Input format: ./file.ts:line:content
 * Output format:
 * Found 3 matches
 * ./file.ts:
 *   Line 1: content
 *   Line 2: another line content
 *   Line 3: yet another line content
 *
 * (double newline between distinct files)
 *
 * @param stdout The raw stdout from ripgrep
 * @param options.matchCount The number of actual matches, excluding context lines
 * @returns Formatted output with matches grouped by file
 */
export function formatCodeSearchOutput(
  stdout: string,
  options: { matchCount?: number } = {},
): string {
  if (!stdout) {
    return 'Found 0 matches'
  }
  const lines = stdout.split('\n')
  const knownFilePaths = collectMatchFilePaths(lines)
  const formatted: string[] = [
    `Found ${options.matchCount ?? knownFilePaths.matchCount} matches`,
  ]
  let currentFile: string | null = null

  for (const line of lines) {
    if (!line.trim()) {
      formatted.push(line)
      continue
    }

    // Skip separator lines between result groups
    if (line === '--') {
      continue
    }

    // Ripgrep output format:
    // - Match lines: filename:line_number:content
    // - Context lines (with -A/-B/-C flags): filename-line_number-content

    // Use known match file paths to disambiguate context lines, which use
    // hyphens as separators and can otherwise conflict with hyphenated paths.
    const parsedLine = parseRipgrepLine(line, knownFilePaths.filePaths)

    if (!parsedLine) {
      formatted.push(line)
      continue
    }
    const { filePath, lineNumber, content } = parsedLine

    // Check if this is a new file (file paths don't start with whitespace)
    if (filePath && !filePath.startsWith(' ') && !filePath.startsWith('\t')) {
      if (filePath !== currentFile) {
        // New file - add double newline before it (except for the first file)
        if (currentFile !== null) {
          formatted.push('')
        }
        currentFile = filePath
        // Show file path with colon on its own line
        formatted.push(filePath + ':')
        formatted.push(`  Line ${lineNumber}: ${content}`)
      } else {
        formatted.push(`  Line ${lineNumber}: ${content}`)
      }
    } else {
      // Line doesn't match expected format, keep as-is
      formatted.push(line)
    }
  }

  return formatted.join('\n')
}

function parseRipgrepLine(
  line: string,
  knownFilePaths: string[] = [],
): {
  filePath: string
  lineNumber: string
  content: string
  isContext: boolean
} | null {
  const matchLine = parseRipgrepMatchLine(line)
  if (matchLine) {
    return matchLine
  }

  const contextLine = parseRipgrepContextLine(line, knownFilePaths)
  if (contextLine) {
    return contextLine
  }

  return null
}

function parseRipgrepMatchLine(line: string): {
  filePath: string
  lineNumber: string
  content: string
  isContext: false
} | null {
  const matchLineMatch = line.match(/(.*?):(\d+):(.*)$/)
  if (matchLineMatch) {
    return {
      filePath: matchLineMatch[1],
      lineNumber: matchLineMatch[2],
      content: matchLineMatch[3],
      isContext: false,
    }
  }

  return null
}

function parseRipgrepContextLine(
  line: string,
  knownFilePaths: string[],
): {
  filePath: string
  lineNumber: string
  content: string
  isContext: true
} | null {
  for (const filePath of knownFilePaths) {
    if (!line.startsWith(filePath + '-')) {
      continue
    }
    const rest = line.slice(filePath.length + 1)
    const lineNumberMatch = rest.match(/^(\d+)-(.*)$/)
    if (!lineNumberMatch) {
      continue
    }
    return {
      filePath,
      lineNumber: lineNumberMatch[1],
      content: lineNumberMatch[2],
      isContext: true,
    }
  }

  const contextLineMatch = line.match(/(.*)-(\d+)-(.*)$/)
  return contextLineMatch
    ? {
        filePath: contextLineMatch[1],
        lineNumber: contextLineMatch[2],
        content: contextLineMatch[3],
        isContext: true,
      }
    : null
}

function collectMatchFilePaths(lines: string[]): {
  filePaths: string[]
  matchCount: number
} {
  const filePaths = new Set<string>()
  let matchCount = 0
  for (const line of lines) {
    const parsedLine = parseRipgrepMatchLine(line)
    if (parsedLine) {
      filePaths.add(parsedLine.filePath)
      matchCount += 1
    }
  }
  return {
    filePaths: [...filePaths].sort((a, b) => b.length - a.length),
    matchCount,
  }
}
