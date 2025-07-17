import {
  ToolName,
  toolNames,
  toolSchema,
} from '@codebuff/common/constants/tools'
import { Saxy } from '@codebuff/common/util/saxy'

import { ToolCallRenderer, defaultToolCallRenderer } from './tool-renderers'

const PREFIX = 'codebuff_tool_'

/**
 * Creates a transform stream that processes XML tool calls
 * @param renderer Custom renderer for tool calls or a map of renderers per tool
 * @param callback Optional callback function to receive processed chunks
 * @returns Transform stream
 */
export function createXMLStreamParser(
  renderer: Record<string, ToolCallRenderer>,
  callback?: (chunk: string) => void
) {
  // Create parser with tool schema validation
  const parser = new Saxy(
    Object.fromEntries(
      Object.entries(toolSchema).map(([tool, schema]) => {
        return [`codebuff_tool_${tool}`, schema]
      })
    )
  )

  // Current state
  let currentTool: string | null = null
  let params: Record<string, string> = {}
  let paramsContent = ''

  // Helper to get the appropriate renderer for the current tool
  const getRenderer = (toolName: string): ToolCallRenderer => {
    if (!renderer) return defaultToolCallRenderer

    // If renderer is a map of tool-specific renderers
    if (typeof renderer === 'object' && !('onToolStart' in renderer)) {
      return (
        (renderer as Record<string, ToolCallRenderer>)[toolName] ||
        defaultToolCallRenderer
      )
    }

    // If renderer is a single renderer
    return renderer as ToolCallRenderer
  }

  // Set up event handlers
  parser.on('tagopen', (tag) => {
    const name = tag.name.slice(PREFIX.length)

    // Check if this is a tool tag
    if (toolNames.includes(name as ToolName)) {
      currentTool = name
      params = {}

      // Call renderer if available
      const toolRenderer = getRenderer(name)
      if (toolRenderer.onToolStart) {
        const output = toolRenderer.onToolStart(
          name,
          Saxy.parseAttrs(tag.attrs).attrs
        )
        if (typeof output === 'string') {
          parser.push(output)
          if (callback) callback(output)
        } else if (output !== null) {
          output()
        }
      }
    }
  })

  parser.on('text', (data) => {
    if (currentTool) {
      // do nothing
      paramsContent += data.contents
    } else {
      // Text outside of tool tags
      parser.push(data.contents)
      if (callback) callback(data.contents)
    }
  })

  parser.on('tagclose', (tag) => {
    const name = tag.name.slice(PREFIX.length)

    if (currentTool && name === currentTool) {
      // Call renderer if available
      const toolRenderer = getRenderer(currentTool)
      const params = JSON.parse(paramsContent)
      for (const [key, value] of Object.entries(params)) {
        const stringValue =
          typeof value === 'string' ? value : JSON.stringify(value)
        if (toolRenderer.onParamStart) {
          const output = toolRenderer.onParamStart(key, stringValue)
          if (typeof output === 'string') {
            parser.push(output)
            if (callback) callback(output)
          } else if (output !== null) {
            output()
          }
        }
        if (toolRenderer.onParamChunk) {
          const output = toolRenderer.onParamChunk(
            stringValue,
            key,
            currentTool
          )
          if (typeof output === 'string') {
            parser.push(output)
            if (callback) callback(output)
          } else if (output !== null) {
            output()
          }
        }
        if (toolRenderer.onParamEnd) {
          const output = toolRenderer.onParamEnd(key, currentTool, stringValue)
          if (typeof output === 'string') {
            parser.push(output)
            if (callback) callback(output)
          } else if (output !== null) {
            output()
          }
        }
      }
      if (toolRenderer.onToolEnd) {
        const output = toolRenderer.onToolEnd(currentTool, params)
        if (typeof output === 'string') {
          parser.push(output)
          if (callback) callback(output)
        } else if (output !== null) {
          output()
        }
      }

      currentTool = null
      paramsContent = ''
    }
  })

  parser.on('end', () => {
    parser.end()
  })

  return parser
}
