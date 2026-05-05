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
  const formatted: string[] = [
    `Found ${options.matchCount ?? countFormattedMatches(lines)} matches`,
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

    // Use regex to find the pattern: separator + digits + separator
    // This handles filenames with hyphens/colons by matching the line number pattern
    const parsedLine = parseRipgrepLine(line)

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

function parseRipgrepLine(line: string): {
  filePath: string
  lineNumber: string
  content: string
  isContext: boolean
} | null {
  // Try match line pattern: filename:digits:content
  const matchLineMatch = line.match(/(.*?):(\d+):(.*)$/)
  if (matchLineMatch) {
    return {
      filePath: matchLineMatch[1],
      lineNumber: matchLineMatch[2],
      content: matchLineMatch[3],
      isContext: false,
    }
  }

  // Try context line pattern: filename-digits-content
  const contextLineMatch = line.match(/(.*?)-(\d+)-(.*)$/)
  if (contextLineMatch) {
    return {
      filePath: contextLineMatch[1],
      lineNumber: contextLineMatch[2],
      content: contextLineMatch[3],
      isContext: true,
    }
  }

  return null
}

function countFormattedMatches(lines: string[]): number {
  return lines.filter((line) => {
    const parsedLine = parseRipgrepLine(line)
    return parsedLine && !parsedLine.isContext
  }).length
}
