export const toolSchema = {
  // Tools that require an id and objective
  add_subgoal: ['id', 'objective', 'status', 'plan', 'log'],
  update_subgoal: ['id', 'status', 'plan', 'log'],

  // File operations
  write_file: ['path', 'content'],
  read_files: ['paths'],

  // Search and terminal
  code_search: ['pattern'],
  run_terminal_command: ['command', 'process_type'],

  // Planning tools
  think_deeply: ['thought'],
  create_plan: ['path', 'plan'],

  browser_logs: ['type', 'url', 'waitUntil'],

  // Simple tools
  end_turn: [], // No parameters
}

export type ToolName = keyof typeof toolSchema

// List of all available tools
export const TOOL_LIST = Object.keys(toolSchema) as ToolName[]
