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

    // Find the first colon to separate file path from content
    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) {
      formatted.push(line)
      continue
    }

    const filePath = line.substring(0, colonIndex)
    const content = line.substring(colonIndex)

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
        // Show content without leading colon on next line
        formatted.push(content.substring(1))
      } else {
        // Same file - just show content without leading colon
        formatted.push(content.substring(1))
      }
    } else {
      // Line doesn't match expected format, keep as-is
      formatted.push(line)
    }
  }

  return formatted.join('\n')
}
