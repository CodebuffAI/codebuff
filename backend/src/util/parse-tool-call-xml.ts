import { ToolResult } from 'common/types/agent-state'
import { Message } from 'common/types/message'
import { toContentString } from 'common/util/messages'
import { generateCompactId } from 'common/util/string'

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

export function renderToolResults(toolResults: ToolResult[]): string {
  return `
${toolResults
  .map(
    (result) => `<tool_result>
<tool>${result.name}</tool>
<result>${result.result}</result>
</tool_result>`
  )
  .join('\n\n')}
`.trim()
}

export const parseToolResults = (xmlString: string): ToolResult[] => {
  if (!xmlString.trim()) return []

  const results: ToolResult[] = []
  const toolResultPattern = /<tool_result>([\s\S]*?)<\/tool_result>/g
  let match

  while ((match = toolResultPattern.exec(xmlString)) !== null) {
    const [_, toolResultContent] = match
    const toolMatch = /<tool>(.*?)<\/tool>/g.exec(toolResultContent)
    const resultMatch = /<result>([\s\S]*?)<\/result>/g.exec(toolResultContent)

    if (toolMatch && resultMatch) {
      results.push({
        id: generateCompactId(),
        name: toolMatch[1],
        result: resultMatch[1].trim(),
      })
    }
  }

  return results
}

export interface TokenCallerMap {
  [filePath: string]: {
    [token: string]: string[] // Array of files that call this token
  }
}

export function renderReadFilesResult(
  files: { path: string; content: string }[],
  tokenCallers: TokenCallerMap
) {
  return files
    .map((file) => {
      const referencedBy =
        Object.entries(tokenCallers[file.path] ?? {})
          .filter(([_, callers]) => callers.length > 0)
          .map(([token, callers]) => `${token}: ${callers.join(', ')}`)
          .join('\n') || 'None'
      return `<read_file>\n<path>${file.path}</path>\n<content>${file.content}</content>\n<referenced_by>${referencedBy}</referenced_by>\n</read_file>`
    })
    .join('\n\n')
}

export function parseReadFilesResult(
  xmlString: string
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

export function isToolResult(message: Message): boolean {
  return toContentString(message).includes('<tool_result')
}
