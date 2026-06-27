/** Friendly labels for the agent's tool calls, shown in the activity fold. */

const NAMES: Record<string, string> = {
  // Codebuff agent tools
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
  // Claude Code tools
  Read: 'Read',
  Write: 'Write',
  Edit: 'Edit',
  MultiEdit: 'Edit',
  NotebookEdit: 'Edit notebook',
  Bash: 'Run',
  Glob: 'Find files',
  Grep: 'Search',
  LS: 'List',
  TodoWrite: 'Plan',
  WebFetch: 'Fetch',
  WebSearch: 'Search web',
  Task: 'Subagent',
}

/** SDK MCP tools come through as `mcp__server__name` — reduce to the bare name. */
const bareToolName = (toolName: string): string =>
  toolName.startsWith('mcp__') ? toolName.split('__').pop()! : toolName

export function toolLabel(toolName: string): string {
  const bare = bareToolName(toolName)
  return NAMES[bare] ?? bare.replace(/_/g, ' ')
}

/** A short, human-readable argument hint for a tool call. */
export function toolArg(toolName: string, input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const i = input as Record<string, any>
  switch (bareToolName(toolName)) {
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
    // Claude Code tools (camelCase inputs)
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return i.file_path ?? i.notebook_path ?? ''
    case 'Bash':
      return i.command ?? ''
    case 'Grep':
      return i.pattern ?? ''
    case 'Glob':
      return i.pattern ?? ''
    case 'LS':
      return i.path ?? ''
    case 'WebFetch':
      return i.url ?? ''
    case 'WebSearch':
      return i.query ?? ''
    case 'Task':
      return i.description ?? ''
    default: {
      const first = Object.values(i)[0]
      return typeof first === 'string' ? first.slice(0, 60) : ''
    }
  }
}
