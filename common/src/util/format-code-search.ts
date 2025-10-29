/**
 * Formats code search output to group matches by file.
 *
 * Input format: ./file.ts:line content
 * Output format:
 * ./file.ts:
 * line content
 * another line content
 * yet another line content
 *
 * (double newline between distinct files)
 *
 * @param stdout The raw stdout from ripgrep
 * @returns Formatted output with matches grouped by file
 */
export function formatCodeSearchOutput(stdout: string): string {
  if (!stdout) {
    return 'No results'
  }
  const lines = stdout.split('\n')
  const formatted: string[] = []
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
    let separatorIndex = -1
    let filePath = ''

    // Try match line pattern: filename:digits:content
    const matchLinePattern = /(.*?):(\d+):(.*)$/
    const matchLineMatch = line.match(matchLinePattern)
    if (matchLineMatch) {
      filePath = matchLineMatch[1]
      separatorIndex = matchLineMatch[1].length
    } else {
      // Try context line pattern: filename-digits-content
      const contextLinePattern = /(.*?)-(\d+)-(.*)$/
      const contextLineMatch = line.match(contextLinePattern)
      if (contextLineMatch) {
        filePath = contextLineMatch[1]
        separatorIndex = contextLineMatch[1].length
      }
    }

    if (separatorIndex === -1) {
      formatted.push(line)
      continue
    }
    const content = line.substring(separatorIndex)

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
        // Show content without leading separator on next line
        formatted.push(content.substring(1))
      } else {
        // Same file - just show content without leading separator
        formatted.push(content.substring(1))
      }
    } else {
      // Line doesn't match expected format, keep as-is
      formatted.push(line)
    }
  }

  return formatted.join('\n')
}
