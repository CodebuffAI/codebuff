import { ToolResultPart } from 'ai'

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

  spawn_agents: ['agents'],
  update_report: ['json_update'],

  // Documentation tool
  read_docs: ['libraryTitle', 'topic', 'max_tokens'],

  // Web search tool
  web_search: ['query', 'depth'],

  // File change hooks tool
  run_file_change_hooks: ['files'],

  end_turn: [],
}

export type ToolName = keyof typeof toolSchema

// List of all available tools
export const TOOL_LIST = Object.keys(toolSchema) as ToolName[]

export const getToolCallString = (
  toolName: ToolName,
  params: Record<string, any>
) => {
  const openTag = `<${toolName}>`
  const closeTag = `</${toolName}>`

  // Get the parameter order from toolSchema
  const paramOrder = toolSchema[toolName] as string[]

  // Create an array of parameter strings in the correct order
  const orderedParams = paramOrder
    .filter((param) => param in params) // Only include params that are actually provided
    .map((param) => {
      const val =
        typeof params[param] === 'string'
          ? params[param]
          : JSON.stringify(params[param])
      return `<${param}>${val}</${param}>`
    })

  // Get any additional parameters not in the schema order
  const additionalParams = Object.entries(params)
    .filter(([param]) => !paramOrder.includes(param))
    .map(([param, value]) => {
      const val = typeof value === 'string' ? value : JSON.stringify(value)
      return `<${param}>${val}</${param}>`
    })

  // Combine ordered and additional parameters
  const paramsString = [...orderedParams, ...additionalParams].join('\n')

  return paramsString
    ? `${openTag}\n${paramsString}\n${closeTag}`
    : `${openTag}${closeTag}`
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
<tool>${result.toolName}</tool>
<result>${result.result}</result>
</tool_result>`
  )
  .join('\n\n')}
`.trim()
}
