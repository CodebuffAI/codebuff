import { ToolResult } from 'common/types/agent-state'
import { generateCompactId } from 'common/util/string'

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
<tool_results>
${toolResults
  .map(
    (result) => `<tool_result>
<tool>${result.name}</tool>
<result>${result.result}</result>
</tool_result>`
  )
  .join('\n')}
</tool_results>
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
        result: resultMatch[1].trim()
      })
    }
  }

  return results
}