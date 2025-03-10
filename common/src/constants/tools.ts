// List of all available tools
export const TOOL_LIST = [
  'add_subgoal',
  'update_subgoal',
  'write_file',
  'read_files',
  'code_search',
  'run_terminal_command',
  'think_deeply',
  'create_plan',
  'end_turn',
] as const

export type ToolName = (typeof TOOL_LIST)[number]
