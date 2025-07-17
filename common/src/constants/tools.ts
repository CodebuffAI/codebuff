import { ToolResultPart } from 'ai'
import { closeXml } from '../util/xml'

// List of all available tools
export const toolNames = [
  'add_subgoal',
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
  'spawn_agents',
  'spawn_agents_async',
  'str_replace',
  'think_deeply',
  'update_report',
  'update_subgoal',
  'web_search',
  'write_file',
] as const

export type ToolName = (typeof toolNames)[number]

export const toolSchema = {
  // Tools that require an id and objective
  add_subgoal: ['id', 'objective', 'status', 'plan', 'log'],
  update_subgoal: ['id', 'status', 'plan', 'log'],

  // File operations
  write_file: ['path', 'instructions', 'content'],
  str_replace: ['path', 'replacements'],
  read_files: ['paths'],
  find_files: ['description'],

  // Search and terminal
  code_search: ['pattern', 'flags', 'cwd'],
  run_terminal_command: ['command', 'process_type', 'cwd', 'timeout_seconds'],

  // Planning tools
  think_deeply: ['thought'],
  create_plan: ['path', 'plan'],

  browser_logs: ['type', 'url', 'waitUntil'],

  send_agent_message: ['target_agent_id', 'prompt', 'params'],
  spawn_agents: ['agents'],
  spawn_agents_async: ['agents'],
  update_report: ['json_update'],

  // Documentation tool
  read_docs: ['libraryTitle', 'topic', 'max_tokens'],

  // Web search tool
  web_search: ['query', 'depth'],

  // File change hooks tool
  run_file_change_hooks: ['files'],

  end_turn: [],
} as const satisfies Record<ToolName, string[]>

export const getToolCallString = (
  toolName: string,
  params: Record<string, any>
) => {
  return `\n<codebuff_tool_${toolName}>\n${JSON.stringify(params, null, 2)}\n</codebuff_tool_${toolName}>\n`
}

export type StringToolResultPart = Omit<ToolResultPart, 'type'> & {
  result: string
}

export function renderToolResults(toolResults: StringToolResultPart[]): string {
  if (toolResults.length === 0) {
    return ''
  }

  return `
${toolResults
  .map(
    (result) => `<tool_result>
<tool>${result.toolName}${closeXml('tool')}
<result>${result.result}${closeXml('result')}
${closeXml('tool_result')}`
  )
  .join('\n\n')}
`.trim()
}
