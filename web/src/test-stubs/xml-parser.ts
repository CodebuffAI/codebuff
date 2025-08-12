// Minimal test stub for @codebuff/internal/xml-parser
// Extracts simple <key>value</key> pairs from a tool-call XML body
export function parseToolCallXml(xml: string): Record<string, string> {
  const result: Record<string, string> = {}
  const regex = /<([a-zA-Z0-9_\/-]+)>([\s\S]*?)<\/\1>/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(xml)) !== null) {
    const key = match[1]
    const value = match[2]?.trim() ?? ''
    // Only record leaf nodes; if there are nested tags, outer will be overwritten later which is fine for tests
    result[key] = value
  }
  return result
}
