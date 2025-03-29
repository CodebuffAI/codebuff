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
  .join('\n')}
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

export function renderReadFilesResult(
  files: { path: string; content: string }[]
) {
  return files
    .map((file) => `<read_file path="${file.path}">${file.content}</read_file>`)
    .join('\n')
}

export function parseReadFilesResult(
  xmlString: string
): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = []
  const filePattern = /<read_file path="([^"]+)">([\s\S]*?)<\/read_file>/g
  let match

  while ((match = filePattern.exec(xmlString)) !== null) {
    const [, filePath, content] = match
    if (filePath.trim()) {
      files.push({ path: filePath, content })
    }
  }

  return files
}

export function isToolResult(message: Message): boolean {
  return toContentString(message).includes('<tool_result')
}
