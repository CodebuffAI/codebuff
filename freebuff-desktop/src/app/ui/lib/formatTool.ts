/** Friendly labels for the agent's tool calls, shown in the activity fold. */

const NAMES: Record<string, string> = {
  read_files: 'Read',
  read_subtree: 'Read tree',
  list_directory: 'List',
  glob: 'Find files',
  code_search: 'Search',
  str_replace: 'Edit',
  write_file: 'Write',
  run_terminal_command: 'Run',
  run_file_change_hooks: 'Hooks',
  set_output: 'Output',
  suggest_prompts: 'Suggest',
  write_doc: 'Write doc',
}

export function toolLabel(toolName: string): string {
  return NAMES[toolName] ?? toolName.replace(/_/g, ' ')
}

/** A short, human-readable argument hint for a tool call. */
export function toolArg(toolName: string, input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const i = input as Record<string, any>
  switch (toolName) {
    case 'read_files':
      return Array.isArray(i.paths) ? i.paths.join(', ') : (i.path ?? '')
    case 'write_file':
    case 'str_replace':
      return i.path ?? ''
    case 'run_terminal_command':
      return i.command ?? ''
    case 'code_search':
      return i.query ?? i.pattern ?? ''
    case 'glob':
      return i.pattern ?? ''
    case 'write_doc':
      return i.name ?? ''
    case 'suggest_prompts':
      return Array.isArray(i.prompts) ? `${i.prompts.length} suggestion(s)` : ''
    default: {
      const first = Object.values(i)[0]
      return typeof first === 'string' ? first.slice(0, 60) : ''
    }
  }
}
