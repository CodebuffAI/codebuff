import { ToolName } from 'common/constants/tools'
import { isFileIgnored } from 'common/project-file-tree'
import { capitalize, snakeToTitleCase } from 'common/util/string'
import { bold, gray, strikethrough } from 'picocolors'

import { getProjectRoot } from '../project-files'

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

let toolStart = true
/**
 * Default renderer for tool calls that formats them nicely for the console
 */
export const defaultToolCallRenderer: ToolCallRenderer = {
  onToolStart: (toolName) => {
    toolStart = true
    return '\n\n' + gray(`[${bold(snakeToTitleCase(toolName))}]`) + '\n'
  },

  onParamChunk: (content, paramName, toolName) => {
    if (toolStart && content.startsWith('\n')) content = content.slice(1)
    toolStart = false
    return gray(content)
  },

  onParamEnd: () => null,

  onToolEnd: () => '\n\n',
}

export const toolRenderers: Record<ToolName, ToolCallRenderer> = {
  end_turn: {
    // Don't render anything
  },
  run_terminal_command: {
    // Don't render anything
  },
  code_search: {
    // Don't render anything
  },
  browser_logs: {
    // Don't render anything
  },
  read_files: {
    ...defaultToolCallRenderer,
    onParamChunk: (content, paramName, toolName) => {
      // Don't render chunks for paths, wait for the full list
      return null
    },

    onParamEnd: (paramName, toolName, content) => {
      const files = content
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((fname) =>
          isFileIgnored(fname, getProjectRoot())
            ? strikethrough(fname) + ' (blocked)'
            : fname
        )
      const numFiles = files.length
      const maxInitialFiles = 3

      if (numFiles <= maxInitialFiles) {
        // If 3 or fewer files, list them all on new lines
        return gray(files.join('\n'))
      } else {
        // If more than 3 files
        const initialFiles = files.slice(0, maxInitialFiles)
        const remainingFiles = files.slice(maxInitialFiles)
        const numRemaining = remainingFiles.length
        const remainingFilesString = remainingFiles.join(' ')

        return gray(
          `${initialFiles.map((file) => '- ' + file).join('\n')}\nand ${numRemaining} more: ${remainingFilesString}`
        )
      }
    },
    onToolEnd: (toolName, params) => {
      // Add a final newline after the file list
      return '\n\n'
    },
  },
  find_files: {
    ...defaultToolCallRenderer,
  },
  think_deeply: {
    ...defaultToolCallRenderer,
  },
  create_plan: {
    ...defaultToolCallRenderer,
    onParamStart: (paramName) => {
      if (paramName === 'path') {
        return gray('Editing plan at ')
      }
      return null
    },
    onParamChunk: (content, paramName) => {
      if (paramName === 'path') {
        return gray(content)
      }
      return null
    },
    onParamEnd: (paramName) => {
      if (paramName === 'path') {
        return gray('...') + '\n'
      }
      return null
    },
  },
  write_file: {
    ...defaultToolCallRenderer,
    onParamStart: (paramName) => {
      if (paramName === 'path') {
        return gray('Editing file at ')
      }
      return null
    },
    onParamChunk: (content, paramName, toolName) => {
      return null
    },
    onParamEnd: (paramName, toolName, content) => {
      if (paramName !== 'path') {
        return null
      }
      return isFileIgnored(content, getProjectRoot())
        ? gray(strikethrough(content) + ' (blocked)')
        : gray(content + '...')
    },
  },
  str_replace: {
    onToolStart: (toolName) => {
      toolStart = true
      return '\n\n' + gray(`[${bold('Edit File')}]`) + '\n'
    },
    onParamStart: (paramName) => {
      if (paramName === 'path') {
        return gray('Editing file at ')
      }
      return null
    },
    onParamChunk: (content, paramName) => {
      if (paramName === 'path') {
        return gray(content)
      }
      return null
    },
    onParamEnd: (paramName) =>
      paramName === 'path' ? gray('...') + '\n' : null,
  },
  add_subgoal: {
    ...defaultToolCallRenderer,
    onParamStart: (paramName, toolName) => {
      if (paramName === 'id') {
        return null
      }
      return gray(capitalize(paramName) + ': ')
    },
    onParamChunk: (content, paramName, toolName) => {
      if (paramName === 'id') {
        return null
      }
      return gray(content)
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
      return gray(capitalize(paramName) + ': ')
    },
    onParamChunk: (content, paramName, toolName) => {
      if (paramName === 'id') {
        return null
      }
      return gray(content)
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
