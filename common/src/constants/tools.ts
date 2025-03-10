// List of all available tools
export const CLIENT_TOOL_LIST = [
  'add_subgoal',
  'update_subgoal',
  'write_file',
  'read_files',
  'code_search',
  'run_terminal_command',
  'think_deeply',
  'end_turn',
] as const

export type ClientTool = (typeof CLIENT_TOOL_LIST)[number]
