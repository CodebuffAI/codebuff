import { TOOL_LIST, ToolName, toolSchema } from 'common/constants/tools'
import { Saxy } from 'common/util/saxy'
import { ToolCallRenderer, defaultToolCallRenderer } from './tool-renderers'

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
  const parser = new Saxy(toolSchema)

  // Current state
  let currentTool: string | null = null
  let currentParam: string | null = null
  let params: Record<string, string> = {}
  let paramContent = ''

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
    const { name } = tag

    // Check if this is a tool tag
    if (TOOL_LIST.includes(name as ToolName)) {
      currentTool = name
      params = {}

      // Call renderer if available
      const toolRenderer = getRenderer(name)
      if (toolRenderer.onToolStart) {
        const output = toolRenderer.onToolStart(
          name,
          Saxy.parseAttrs(tag.attrs) as Record<string, string>
        )
        if (output !== null) {
          parser.push(output)
          if (callback) callback(output)
        }
      }
    }
    // Check if this is a parameter tag inside a tool
    else if (currentTool && !currentParam) {
      currentParam = name
      paramContent = ''

      // Call renderer if available
      const toolRenderer = getRenderer(currentTool)
      if (toolRenderer.onParamStart) {
        const output = toolRenderer.onParamStart(name, currentTool)
        if (output !== null) {
          parser.push(output)
          if (callback) callback(output)
        }
      }
    }
  })

  parser.on('text', (data) => {
    if (currentTool && currentParam) {
      paramContent += data.contents

      // Call renderer if available
      const toolRenderer = getRenderer(currentTool)
      if (toolRenderer.onParamChunk) {
        const output = toolRenderer.onParamChunk(
          data.contents,
          currentParam,
          currentTool
        )
        if (output !== null) {
          parser.push(output)
          if (callback) callback(output)
        }
      }
    } else {
      // Text outside of tool tags
      parser.push(data.contents)
      if (callback) callback(data.contents)
    }
  })

  parser.on('tagclose', (tag) => {
    const { name } = tag

    // Check if this is a parameter tag closing
    if (currentTool && currentParam && name === currentParam) {
      // Store parameter content
      params[currentParam] = paramContent

      // Call renderer if available
      const toolRenderer = getRenderer(currentTool)
      if (toolRenderer.onParamEnd) {
        const output = toolRenderer.onParamEnd(
          currentParam,
          currentTool,
          paramContent
        )
        if (output !== null) {
          parser.push(output)
          if (callback) callback(output)
        }
      }

      currentParam = null
      paramContent = ''
    }
    // Check if this is a tool tag closing
    else if (currentTool && name === currentTool) {
      // Call renderer if available
      const toolRenderer = getRenderer(currentTool)
      if (toolRenderer.onToolEnd) {
        const output = toolRenderer.onToolEnd(currentTool, params)
        if (output !== null) {
          parser.push(output)
          if (callback) callback(output)
        }
      }

      currentTool = null
      params = {}
    }
  })

  parser.on('end', () => {
    parser.end()
  })

  return parser
}
