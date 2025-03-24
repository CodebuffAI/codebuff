import { ToolResult } from 'common/types/agent-state'
import { generateCompactId } from 'common/util/string'
import { Message } from 'common/types/message'
import { toContentString } from 'common/util/messages'

/**
 * Parses XML content for a tool call into a structured object.
 * Example input:
 * <type>click</type>
 * <selector>#button</selector>
 * <timeout>5000</timeout>
 */
export function parseToolCallXml(xmlString: string): Record<string, any> {
  if (!xmlString.trim()) return {}

  const result: Record<string, any> = {}
  const tagPattern = /<(\w+)>([\s\S]*?)<\/\1>/g
  let match

  while ((match = tagPattern.exec(xmlString)) !== null) {
    const [_, key, rawValue] = match

    // Remove leading/trailing whitespace but preserve internal whitespace
    const value = rawValue.replace(/^\s+|\s+$/g, '')

    // Check for nested range tags
    if (key === 'xRange' || key === 'yRange') {
      const minMatch = /<min>(\d+\.?\d*)<\/min>/g.exec(value)
      const maxMatch = /<max>(\d+\.?\d*)<\/max>/g.exec(value)
      if (minMatch && maxMatch) {
        result[key] = {
          min: Number(minMatch[1]),
          max: Number(maxMatch[1]),
        }
        continue
      }
    }

    // Convert other values to appropriate types
    if (value === 'true') result[key] = true
    else if (value === 'false') result[key] = false
    else if (value === '')
      result[key] = '' // Handle empty tags
    else if (!isNaN(Number(value))) result[key] = Number(value)
    else result[key] = value
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

/**
 * Simplifies read_files tool results to just show file paths while preserving other tool results.
 * @param messageContent The message content containing tool results
 * @returns The message content with simplified read_files results
 */
export function simplifyReadFileResults(messageContent: string | {}[]): string {
  const resultsStr =
    typeof messageContent === 'string'
      ? messageContent
      : ((messageContent[messageContent.length - 1] as any)?.text as string) ??
        ''
  if (!resultsStr.includes('<tool_result')) {
    return resultsStr
  }

  const toolResults = parseToolResults(resultsStr)
  const readFileResults = toolResults.filter(
    (result) => result.name === 'read_files'
  )

  if (readFileResults.length === 0) {
    return resultsStr
  }

  // Keep non-read_files results unchanged
  const otherResults = toolResults.filter(
    (result) => result.name !== 'read_files'
  )

  // Create simplified read_files results: only show file paths
  const simplifiedReadFileResults = readFileResults.map((toolResult) => {
    const fileBlocks = parseReadFilesResult(toolResult.result)
    const filePaths = fileBlocks.map((block) => block.path)
    return {
      id: toolResult.id, // Keep original ID
      name: 'read_files',
      result: `Read the following files: ${filePaths.join('\n')}`,
    }
  })

  // Combine both types of results
  return renderToolResults([...simplifiedReadFileResults, ...otherResults])
}

export function isToolResult(message: Message): boolean {
  return toContentString(message).includes('<tool_result')
}
