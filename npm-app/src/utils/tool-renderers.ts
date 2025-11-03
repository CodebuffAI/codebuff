import fs from 'fs'

import { isFileIgnored } from '@codebuff/common/project-file-tree'
import { capitalize, snakeToTitleCase } from '@codebuff/common/util/string'
import { bold, gray, strikethrough } from 'picocolors'

import { Client } from '../client'
import { getProjectRoot } from '../project-files'
import { Spinner } from './spinner'

import type { ToolName } from '@codebuff/common/tools/constants'

interface SpawnAgentConfig {
  agent_type: string
  prompt?: string
  params?: Record<string, any>
}

/**
 * Interface for handling tool call rendering
 */
export interface ToolCallRenderer {
  // Called when a tool tag starts
  onToolStart?: (
    toolName: string,
    attributes: Record<string, string>,
  ) => string | null | (() => void)

  // Called when a parameter tag is found within a tool
  onParamStart?: (
    paramName: string,
    toolName: string,
  ) => string | null | (() => void)

  // Called when parameter content is received
  onParamChunk?: (
    content: string,
    paramName: string,
    toolName: string,
  ) => string | null | (() => void)

  // Called when a parameter tag ends
  onParamEnd?: (
    paramName: string,
    toolName: string,
    content: string,
  ) => string | null | (() => void)

  // Called when a tool tag ends
  onToolEnd?: (
    toolName: string,
    params: Record<string, string>,
  ) => string | null | (() => void)
}

let toolStart = true

/**
 * Shared function for rendering spawn agents parameters
 */
const renderSpawnAgentsParam = (
  paramName: string,
  toolName: string,
  content: string,
) => {
  if (paramName === 'agents') {
    let agents: SpawnAgentConfig[] = []
    try {
      agents = JSON.parse(content)
    } catch (e) {
      return null
    }
    if (agents.length > 0) {
      const client = Client.getInstance(false)
      return gray(
        agents
          .map((props: SpawnAgentConfig) => {
            const agentType = props.agent_type
            const prompt = props.prompt
            const agentName =
              (client?.agentNames && client.agentNames[agentType]) || agentType

            return `@${bold(agentName)}:\n${prompt || 'No prompt provided'}`
          })
          .join('\n\n') + '\n',
      )
    }
  }
  return null
}

/**
 * Default renderer for tool calls that formats them nicely for the console
 */
export const defaultToolCallRenderer: ToolCallRenderer = {
  onToolStart: (toolName) => {
    toolStart = true
    return '\n\n' + gray(`[${bold(snakeToTitleCase(toolName))}]`) + '\n'
  },

  onParamChunk: (content, paramName, toolName) => {
    if (content == null || content === '') return null
    // Only trim the first newline if there are multiple leading newlines
    if (toolStart && content.startsWith('\n\n')) {
      content = content.slice(1)
    }
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
  task_completed: {
    // Don't render anything
  },
  run_terminal_command: {
    // Don't render anything
  },
  code_search: {
    // Don't render anything
  },
  glob: {
    // Don't render anything
  },
  list_directory: {
    // Don't render anything
  },
  browser_logs: {
    // Don't render anything
  },
  run_file_change_hooks: {
    // Don't render anything
  },
  read_files: {
    ...defaultToolCallRenderer,
    onParamChunk: (content, paramName, toolName) => {
      // Don't render chunks for paths, wait for the full list
      return null
    },

    onParamEnd: (paramName, toolName, content) => {
      let files: string[] = []
      try {
        files = JSON.parse(content)
      } catch (e) {
        return null
      }
      files = files.map((fname) =>
        isFileIgnored({ filePath: fname, projectRoot: getProjectRoot(), fs })
          ? strikethrough(fname) + ' (blocked)'
          : fname,
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
          `${initialFiles.map((file) => '- ' + file).join('\n')}\nand ${numRemaining} more: ${remainingFilesString}`,
        )
      }
    },
    onToolEnd: (toolName, params) => {
      // Add a final newline after the file list
      return '\n\n'
    },
  },
  read_subtree: {
    ...defaultToolCallRenderer,
  },
  read_docs: {
    ...defaultToolCallRenderer,
  },
  web_search: {
    ...defaultToolCallRenderer,
    onParamChunk: (content, paramName, toolName) => {
      return null
    },
    onParamEnd: (paramName, toolName, content) => {
      if (paramName !== 'query') {
        return null
      }
      return gray(content)
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
      if (paramName === 'path') {
        return isFileIgnored({
          filePath: content,
          projectRoot: getProjectRoot(),
          fs,
        })
          ? gray(strikethrough(content) + ' (blocked)')
          : gray(content + '...')
      }
      if (paramName === 'instructions') {
        return gray('\n' + content)
      }
      return null
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
  spawn_agents: {
    onToolStart: (toolName) => {
      return '\n\n' + gray(`[${bold('Spawn Agents')}]`) + '\n'
    },
    onParamEnd: renderSpawnAgentsParam,
    onToolEnd: () => {
      return () => {
        Spinner.get().start('Agents running...')
        return '\n'
      }
    },
  },
  spawn_agent_inline: {
    // Don't render anything
  },
  add_message: {
    // Don't render anything
  },
  set_messages: {
    // Don't render anything
  },
  set_output: {
    ...defaultToolCallRenderer,
    onToolStart: (toolName) => {
      toolStart = true
      return '\n\n' + gray(`[${bold('Set Output')}]`) + '\n'
    },
    onParamChunk: (content, paramName, toolName) => {
      if (paramName === 'message') {
        return gray(content)
      }
      return null
    },
  },
  lookup_agent_info: {
    ...defaultToolCallRenderer,
  },
  write_todos: {
    ...defaultToolCallRenderer,
    onParamChunk: (content, paramName, toolName) => {
      // Don't render chunks for todos array, wait for the full list
      return null
    },
    onParamEnd: (paramName, toolName, content) => {
      if (paramName !== 'todos') {
        return null
      }
      let todos: Array<{ task: string; completed: boolean }> = []
      try {
        todos = JSON.parse(content)
      } catch (e) {
        return null
      }
      // Format as checkbox list
      const formattedTodos = todos
        .map((todo) => `${todo.completed ? '[x]' : '[]'} ${todo.task}`)
        .join('\n')
      return gray(formattedTodos)
    },
  },
}
