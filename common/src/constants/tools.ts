export const toolSchema = {
  // Tools that require an id and objective
  add_subgoal: ['id', 'objective', 'status', 'plan', 'log'],
  update_subgoal: ['id', 'status', 'plan', 'log'],

  // File operations
  write_file: ['path', 'instructions', 'content'],
  str_replace: ['path', /old_\d+/, /new_\d+/],
  read_files: ['paths'],
  find_files: ['description'],

  // Search and terminal
  code_search: ['pattern'],
  run_terminal_command: ['command', 'process_type', 'cwd', 'timeout_seconds'],

  // Planning tools
  think_deeply: ['thought'],
  create_plan: ['path', 'plan'],

  browser_logs: ['type', 'url', 'waitUntil'],

  // Agent-only tools
  kill_terminal: [],
  sleep: ['seconds'],

  end_turn: [],
}

export type ToolName = keyof typeof toolSchema

// List of all available tools
export const TOOL_LIST = Object.keys(toolSchema) as ToolName[]

export const getToolCallString = (
  toolName: ToolName,
  params: Record<string, string>
) => {
  const openTag = `<${toolName}>`
  const closeTag = `</${toolName}>`

  // Get the parameter order from toolSchema
  const paramOrder = toolSchema[toolName] as string[]

  // Create an array of parameter strings in the correct order
  const orderedParams = paramOrder
    .filter((param) => param in params) // Only include params that are actually provided
    .map((param) => `<${param}>${params[param]}</${param}>`)

  // Get any additional parameters not in the schema order
  const additionalParams = Object.entries(params)
    .filter(([param]) => !paramOrder.includes(param))
    .map(([param, value]) => `<${param}>${value}</${param}>`)

  // Combine ordered and additional parameters
  const paramsString = [...orderedParams, ...additionalParams].join('\n')

  return paramsString
    ? `${openTag}\n${paramsString}\n${closeTag}`
    : `${openTag}${closeTag}`
}
