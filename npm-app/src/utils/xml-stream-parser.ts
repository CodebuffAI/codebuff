import { bold } from 'picocolors'
import { snakeToTitleCase } from 'common/util/string'
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
  onParamContent?: (
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
    return `[${bold(snakeToTitleCase(toolName))}]`
  },

  onParamContent: (content, paramName, toolName) => {
    // For run_terminal_command, we want to show the command
    if (toolName === 'run_terminal_command' && paramName === 'command') {
      return content
    }

    // For code_search, we want to show the pattern
    if (toolName === 'code_search' && paramName === 'pattern') {
      return content
    }

    // For read_files, we want to show the paths
    if (toolName === 'read_files' && paramName === 'paths') {
      return content.split('\n').join(',')
    }

    // For other tools, we might not want to show all parameters
    return null
  },

  onParamEnd: () => null,

  onToolEnd: () => null,
}

/**
 * Creates a transform stream that processes XML tool calls
 * @param renderer Custom renderer for tool calls
 * @param callback Optional callback function to receive processed chunks
 * @returns Transform stream
 */
export function createXMLStreamParser(
  renderer: ToolCallRenderer,
  callback?: (chunk: string) => void
) {
  const parser = new Saxy()

  // Current state
  let currentTool: string | null = null
  let currentParam: string | null = null
  let params: Record<string, string> = {}
  let paramContent = ''

  // Set up event handlers
  parser.on('tagopen', (tag) => {
    const { name } = tag

    // Check if this is a tool tag
    if (TOOL_LIST.includes(name as any)) {
      currentTool = name
      params = {}

      // Call renderer if available
      if (renderer.onToolStart) {
        const output = renderer.onToolStart(
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
      if (renderer.onParamStart) {
        const output = renderer.onParamStart(name, currentTool)
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
      if (renderer.onParamContent) {
        const output = renderer.onParamContent(
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
      if (renderer.onParamEnd) {
        const output = renderer.onParamEnd(
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
      if (renderer.onToolEnd) {
        const output = renderer.onToolEnd(currentTool, params)
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
