import { bold, bgBlack } from 'picocolors'
import { capitalize, snakeToTitleCase } from 'common/util/string'
import { ToolName } from 'common/constants/tools'

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
    return bgBlack(`[${bold(snakeToTitleCase(toolName))}]\n`)
  },

  onParamChunk: (content, paramName, toolName) => {
    return bgBlack(content)
  },

  onParamEnd: () => null,

  onToolEnd: () => null,
}

export const toolRenderers: Record<ToolName, ToolCallRenderer> = {
  run_terminal_command: {
    // Don't render anything
  },
  code_search: {
    // Don't render anything
  },
  end_turn: {
    // Don't render anything
  },
  browser_logs: {
    // Don't render anything
  },
  read_files: {
    ...defaultToolCallRenderer,
    onParamChunk: (content, paramName, toolName) => {
      return null
    },

    onParamEnd: (paramName, toolName, content) => bgBlack(content.trim()),
    onToolEnd: (toolName, params) => {
      return `\n`
    },
  },
  think_deeply: {
    ...defaultToolCallRenderer,
  },
  create_plan: {
    ...defaultToolCallRenderer,
    onParamStart: (paramName) => {
      if (paramName === 'path') {
        return bgBlack('Editing plan at ')
      }
      return null
    },
    onParamChunk: (content, paramName) => {
      if (paramName === 'path') {
        return bgBlack(content)
      }
      return null
    },
    onParamEnd: (paramName) => {
      if (paramName === 'path') {
        return bgBlack('...\n')
      }
      return null
    },
  },
  write_file: {
    ...defaultToolCallRenderer,
    onParamStart: (paramName) => {
      if (paramName === 'path') {
        return bgBlack('Editing file at ')
      }
      return null
    },
    onParamChunk: (content, paramName, toolName) => {
      if (paramName === 'path') {
        return bgBlack(content)
      }
      return null
    },
    onParamEnd: (paramName) => (paramName === 'path' ? '...' : null),
  },
  add_subgoal: {
    ...defaultToolCallRenderer,
    onParamStart: (paramName, toolName) => {
      if (paramName === 'id') {
        return null
      }
      return bgBlack(capitalize(paramName) + ': ')
    },
    onParamChunk: (content, paramName, toolName) => {
      if (paramName === 'id') {
        return null
      }
      return bgBlack(content)
    },
    onParamEnd: (paramName) => {
      const paramsWithNewLine = ['objective', 'status']
      if (paramsWithNewLine.includes(paramName)) {
        return '\n'
      }
      return null
    },
  },
  update_subgoal: {
    ...defaultToolCallRenderer,
    onParamStart: (paramName, toolName) => {
      if (paramName === 'id') {
        return null
      }
      return bgBlack(capitalize(paramName) + ': ')
    },
    onParamChunk: (content, paramName, toolName) => {
      if (paramName === 'id') {
        return null
      }
      return bgBlack(content)
    },
    onParamEnd: (paramName) => {
      const paramsWithNewLine = ['status']
      if (paramsWithNewLine.includes(paramName)) {
        return '\n'
      }
      return null
    },
  },
}
