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
  'render_ui',
  'suggest_followups',
  'task_completed',
]

// List of all available tools
export const toolNames = [
  'apply_patch',
  'apply_smart_patch',
  'add_subgoal',
  'add_message',
  'ask_user',
  'browser_logs',
  'code_search',
  'create_plan',
  'end_turn',
  'edit_transaction',
  'find_files',
  'glob',
  'list_directory',
  'lookup_agent_info',
  'propose_edit_transaction',
  'propose_str_replace',
  'propose_write_file',
  'query_index',
  'read_docs',
  'read_files',
  'read_outline',
  'read_slices',
  'read_proposal_workspace',
  'read_subtree',
  'replace_range',
  'render_ui',
  'run_file_change_hooks',
  'run_terminal_command',
  'set_messages',
  'set_output',
  'skill',
  'spawn_agents',
  'spawn_agent_inline',
  'str_replace',
  'suggest_followups',
  'task_completed',
  'think_deeply',
  'update_subgoal',
  'web_search',
  'write_file',
  'write_todos',
] as const

export const publishedTools = [
  'apply_patch',
  'apply_smart_patch',
  'add_message',
  'ask_user',
  'code_search',
  'end_turn',
  'edit_transaction',
  'find_files',
  'glob',
  'list_directory',
  'lookup_agent_info',
  'propose_edit_transaction',
  'propose_str_replace',
  'propose_write_file',
  'query_index',
  'read_docs',
  'read_files',
  'read_outline',
  'read_slices',
  'read_proposal_workspace',
  'read_subtree',
  'replace_range',
  'render_ui',
  'run_file_change_hooks',
  'run_terminal_command',
  'set_messages',
  'set_output',
  'skill',
  'spawn_agents',
  'str_replace',
  'suggest_followups',
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
}
