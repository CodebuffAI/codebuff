import { ToolResultPart } from 'ai'
import { closeXml } from '../util/xml'

export const toolNameParam = 'codebuff_tool_name'
export const endsAgentStepParam = 'codebuff_end_step'
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
  set_output: ['output'],
  update_report: ['json_update'],

  // Documentation tool
  read_docs: ['libraryTitle', 'topic', 'max_tokens'],

  // Web search tool
  web_search: ['query', 'depth'],

  // File change hooks tool
  run_file_change_hooks: ['files'],

  // Tools that change the conversation history
  add_message: ['role', 'content'],
  set_messages: ['messages'],

  end_turn: [],
} as const satisfies Record<ToolName, string[]>

export const getToolCallString = (
  toolName: string,
  params: Record<string, any>,
  endsAgentStep: boolean
) => {
  return [
    startToolTag,
    JSON.stringify(
      {
        [toolNameParam]: toolName,
        ...params,
        [endsAgentStepParam]: endsAgentStep,
      },
      null,
      2
    ),
    endToolTag,
  ].join('')
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
