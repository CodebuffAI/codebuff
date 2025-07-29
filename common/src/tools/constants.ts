import type { ToolResultPart } from 'ai'

import z from 'zod/v4'

export const toolNameParam = 'cb_tool_name'
export const endsAgentStepParam = 'cb_easp'
export const toolXmlName = 'codebuff_tool_call'
export const startToolTag = `<${toolXmlName}>\n`
export const endToolTag = `\n</${toolXmlName}>`

// List of all available tools
export const toolNames = [
  'add_subgoal',
  'add_message',
  'browser_logs',
  'code_search',
  'create_plan',
  'end_turn',
  'find_files',
  'read_docs',
  'read_files',
  'run_file_change_hooks',
  'run_terminal_command',
  'send_agent_message',
  'set_messages',
  'set_output',
  'spawn_agents',
  'spawn_agents_async',
  'str_replace',
  'think_deeply',
  'update_subgoal',
  'web_search',
  'write_file',
] as const

export type ToolName = (typeof toolNames)[number]

export type ToolParams<T extends ToolName = ToolName> = {
  toolName: T
  endsAgentStep: boolean
  parameters: z.ZodType
}

export type StringToolResultPart = Omit<ToolResultPart, 'type'> & {
  result: string
}
