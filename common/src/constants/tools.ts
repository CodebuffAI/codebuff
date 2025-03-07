// List of all available tools
export const TOOL_LIST = [
  'add_subgoal',
  'update_subgoal',
  'write_file',
  'read_files',
  'find_files',
  'code_search',
  'run_terminal_command',
  'think_deeply',
  'end_turn',
] as const

export type ToolName = (typeof TOOL_LIST)[number]

// Tools that end the response when called
export const TOOLS_WHICH_END_THE_RESPONSE = [
  'read_files',
  'find_files',
  'code_search',
  'run_terminal_command',
  'think_deeply',
]
