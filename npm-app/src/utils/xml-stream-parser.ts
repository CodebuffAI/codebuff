import { bold } from 'picocolors'
import { capitalize, snakeToTitleCase } from 'common/util/string'
import { TOOL_LIST } from 'common/constants/tools'
import { Saxy } from 'common/util/saxy'

/**
 * Interface for handling tool call rendering
 */
export interface ToolCallRenderer {
  // Called when a tool tag starts
  onToolStart?: (
    toolName: string,
    attributes: Record<string, string>
  ) => string | null

  // Called when a parameter tag is found within a tool
  onParamStart?: (paramName: string, toolName: string) => string | null

  // Called when parameter content is received
  onParamChunk?: (
    content: string,
    paramName: string,
    toolName: string
  ) => string | null

  // Called when a parameter tag ends
  onParamEnd?: (
    paramName: string,
    toolName: string,
    content: string
  ) => string | null

  // Called when a tool tag ends
  onToolEnd?: (
    toolName: string,
    params: Record<string, string>
  ) => string | null
}

/**
 * Default renderer for tool calls that formats them nicely for the console
 */
export const defaultToolCallRenderer: ToolCallRenderer = {
  onToolStart: (toolName) => {
    return `[${bold(snakeToTitleCase(toolName))}]\n`
  },

  onParamChunk: (content, paramName, toolName) => {
    return content
  },

  onParamEnd: () => '\n',

  onToolEnd: () => null,
}

export const toolRenderers: Record<string, ToolCallRenderer> = {
  ...Object.fromEntries(
    TOOL_LIST.map((tool) => {
      return [
        tool,
        {
          ...defaultToolCallRenderer,
        },
      ]
    })
  ),
  run_terminal_command: {
    // Don't render anything
  },
  code_search: {
    // Don't render anything
  },
  read_files: {
    // Don't render anything
  },
  write_file: {
    ...defaultToolCallRenderer,
    onParamChunk: (content, paramName, toolName) => {
      if (paramName === 'path') {
        return content
      }
      return null
    },
  },
  add_subgoal: {
    ...defaultToolCallRenderer,
    onParamStart: (paramName, toolName) => {
      if (paramName === 'id') {
        return null
      }
      return capitalize(paramName) + ': '
    },
    onParamChunk: (content, paramName, toolName) => {
      if (paramName === 'id') {
        return null
      }
      return content
    },
    onParamEnd: (paramName) => (paramName === 'id' ? null : '\n'),
  },
  update_subgoal: {
    ...defaultToolCallRenderer,
    onParamStart: (paramName, toolName) => {
      if (paramName === 'id') {
        return null
      }
      return capitalize(paramName) + ': '
    },
    onParamChunk: (content, paramName, toolName) => {
      if (paramName === 'id') {
        return null
      }
      return content
    },
    onParamEnd: (paramName) => (paramName === 'id' ? null : '\n'),
  },
}

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
  const parser = new Saxy()

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
    if (TOOL_LIST.includes(name as any)) {
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
