/**
 * Shared XML parsing utilities for tool calls
 * Used by both backend and web applications
 */

/**
 * Parses XML content for a tool call into a structured object with only string values.
 * Example input:
 * <type>click</type>
 * <selector>#button</selector>
 * <timeout>5000</timeout>
 */
export function parseToolCallXml(xmlString: string): Record<string, string> {
  if (!xmlString.trim()) return {}

  const result: Record<string, string> = {}
  const tagPattern = /<(\w+)>([\s\S]*?)<\/\1>/g
  let match

  while ((match = tagPattern.exec(xmlString)) !== null) {
    const [_, key, rawValue] = match

    // Remove leading/trailing whitespace but preserve internal whitespace
    const value = rawValue.replace(/^\s+|\s+$/g, '')

    // Assign all values as strings
    result[key] = value
  }

  return result
}

/**
 * Tool result part interface
 */
export interface StringToolResultPart {
  toolName: string
  toolCallId: string
  result: string
}

/**
 * Parse tool results from XML string
 */
export const parseToolResults = (xmlString: string): StringToolResultPart[] => {
  if (!xmlString.trim()) return []

  const results: StringToolResultPart[] = []
  const toolResultPattern = /<tool_result>([\s\S]*?)<\/tool_result>/g
  let match

  while ((match = toolResultPattern.exec(xmlString)) !== null) {
    const [_, toolResultContent] = match
    const toolMatch = /<tool>(.*?)<\/tool>/g.exec(toolResultContent)
    const resultMatch = /<result>([\s\S]*?)<\/result>/g.exec(toolResultContent)

    if (toolMatch && resultMatch) {
      results.push({
        toolName: toolMatch[1],
        toolCallId: generateCompactId(),
        result: resultMatch[1].trim(),
      })
    }
  }

  return results
}

/**
 * Token caller map for file references
 */
export interface TokenCallerMap {
  [filePath: string]: {
    [token: string]: string[] // Array of files that call this token
  }
}

/**
 * Parse read files result from XML
 */
export function parseReadFilesResult(
  xmlString: string,
): { path: string; content: string; referencedBy: string }[] {
  const files: { path: string; content: string; referencedBy: string }[] = []
  const filePattern =
    /<read_file>\s*<path>([^<>]+)<\/path>\s*<content>([\s\S]*?)<\/content>\s*<referenced_by>([\s\S]*?)<\/referenced_by>\s*<\/read_file>/g
  let match

  while ((match = filePattern.exec(xmlString)) !== null) {
    const [, filePath, content, referencedBy] = match
    if (filePath.trim()) {
      files.push({ path: filePath.trim(), content, referencedBy })
    }
  }

  return files
}

/**
 * Check if a message contains tool results
 */
export function isToolResult(messageContent: string): boolean {
  return messageContent.includes('<tool_result')
}

/**
 * Generate a compact ID (simplified version)
 */
function generateCompactId(): string {
  return Math.random().toString(36).substring(2, 9)
}
