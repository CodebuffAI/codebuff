import z from 'zod/v4'

import { jsonToolErrorSchema } from './params/utils'

import type { ToolResultOutput } from '../types/messages/content-part'
import type { Tool } from 'ai'

export const toolNameParam = 'cb_tool_name'
export const endsAgentStepParam = 'cb_easp'
export const toolXmlName = 'codebuff_tool_call'
export const startToolTag = `<${toolXmlName}>\n`
export const endToolTag = `\n</${toolXmlName}>`

export const TOOLS_WHICH_WONT_FORCE_NEXT_STEP = [
  'think_deeply',
  'set_output',
  'set_messages',
  'add_message',
  'update_subgoal',
  'create_plan',
  'task_completed',
]

// List of all available tools
export const toolNames = [
  'add_subgoal',
  'add_message',
  'browser_logs',
  'code_search',
  'create_plan',
  'end_turn',
  'find_files',
  'glob',
  'list_directory',
  'lookup_agent_info',
  'read_docs',
  'read_files',
  'read_subtree',
  'run_file_change_hooks',
  'run_terminal_command',
  'set_messages',
  'set_output',
  'spawn_agents',
  'spawn_agent_inline',
  'str_replace',
  'task_completed',
  'think_deeply',
  'update_subgoal',
  'web_search',
  'write_file',
  'write_todos',
] as const

export const publishedTools = [
  'add_message',
  'code_search',
  'end_turn',
  'find_files',
  'glob',
  'list_directory',
  'lookup_agent_info',
  'read_docs',
  'read_files',
  'read_subtree',
  'run_file_change_hooks',
  'run_terminal_command',
  'set_messages',
  'set_output',
  'spawn_agents',
  'str_replace',
  'task_completed',
  'think_deeply',
  'web_search',
  'write_file',
  'write_todos',
  // 'spawn_agent_inline',
] as const

export type ToolName = (typeof toolNames)[number]
export type PublishedToolName = (typeof publishedTools)[number]

/** Only used for validating tool definitions */
export type $ToolParams<T extends ToolName = ToolName> = Required<
  Pick<
    Tool<any, ToolResultOutput[]>,
    'description' | 'inputSchema' | 'outputSchema'
  >
> & {
  toolName: T
  endsAgentStep: boolean
  outputSchema: z.ZodType<ToolResultOutput[]>
}

export function validateToolParams<T extends $ToolParams>(
  params: T,
): Omit<T, 'outputSchema'> & {
  outputSchema: z.ZodUnion<
    [T['outputSchema'], ReturnType<typeof jsonToolErrorSchema>]
  >
  __validated: true
} {
  return {
    ...params,
    outputSchema: z.union([params.outputSchema, jsonToolErrorSchema()]),
    __validated: true,
  }
}
export type $ValidatedToolParams<T extends ToolName = ToolName> = Omit<
  $ToolParams<T>,
  'outputSchema'
> & {
  outputSchema: z.ZodTypeAny
  __validated: true
}
