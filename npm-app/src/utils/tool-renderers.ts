import { bold } from 'picocolors'
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
    return `[${bold(snakeToTitleCase(toolName))}]\n`
  },

  onParamChunk: (content, paramName, toolName) => {
    return content
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
  read_files: {
    // Don't render anything
  },
  end_turn: {
    // Don't render anything
  },
  think_deeply: {
    ...defaultToolCallRenderer,
  },
  create_plan: {
    ...defaultToolCallRenderer,
    onParamStart: (paramName) => {
      if (paramName === 'path') {
        return 'Editing plan at '
      }
      return null
    },
    onParamChunk: (content, paramName) => {
      if (paramName === 'path') {
        return content
      }
      return null
    },
    onParamEnd: (paramName) => {
      if (paramName === 'path') {
        return '...\n'
      }
      return null
    },
  },
  write_file: {
    ...defaultToolCallRenderer,
    onParamStart: (paramName) => {
      if (paramName === 'path') {
        return 'Editing file at '
      }
      return null
    },
    onParamChunk: (content, paramName, toolName) => {
      if (paramName === 'path') {
        return content
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
