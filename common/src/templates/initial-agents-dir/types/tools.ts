/**
 * Union type of all available tool names
 */
export type ToolName =
  | 'add_message'
  | 'ask_user'
  | 'code_search'
  | 'end_turn'
  | 'find_files'
  | 'glob'
  | 'list_directory'
  | 'lookup_agent_info'
  | 'read_docs'
  | 'read_files'
  | 'read_subtree'
  | 'run_file_change_hooks'
  | 'run_terminal_command'
  | 'set_messages'
  | 'set_output'
  | 'spawn_agents'
  | 'str_replace'
  | 'suggest_followups'
  | 'task_completed'
  | 'think_deeply'
  | 'web_search'
  | 'write_file'
  | 'write_todos'

/**
 * Map of tool names to their parameter types
 */
export interface ToolParamsMap {
  add_message: AddMessageParams
  ask_user: AskUserParams
  code_search: CodeSearchParams
  end_turn: EndTurnParams
  find_files: FindFilesParams
  glob: GlobParams
  list_directory: ListDirectoryParams
  lookup_agent_info: LookupAgentInfoParams
  read_docs: ReadDocsParams
  read_files: ReadFilesParams
  read_subtree: ReadSubtreeParams
  run_file_change_hooks: RunFileChangeHooksParams
  run_terminal_command: RunTerminalCommandParams
  set_messages: SetMessagesParams
  set_output: SetOutputParams
  spawn_agents: SpawnAgentsParams
  str_replace: StrReplaceParams
  suggest_followups: SuggestFollowupsParams
  task_completed: TaskCompletedParams
  think_deeply: ThinkDeeplyParams
  web_search: WebSearchParams
  write_file: WriteFileParams
  write_todos: WriteTodosParams
}

/**
 * Add a new message to the conversation history. To be used for complex requests that can't be solved in a single step, as you may forget what happened!
 */
export interface AddMessageParams {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Ask the user multiple choice questions and pause execution until they respond.
 */
export interface AskUserParams {
  /** List of multiple choice questions to ask the user */
  questions: {
    /** The question to ask the user */
    question: string
    /** Short label (max 12 chars) displayed as a chip/tag */
    header?: string
    /** Array of answer options with label and optional description (minimum 2) */
    options: {
      /** The display text for this option */
      label: string
      /** Explanation shown when option is focused */
      description?: string
    }[]
    /** If true, allows selecting multiple options (checkbox). If false, single selection only (radio). */
    multiSelect?: boolean
    /** Validation rules for "Other" text input */
    validation?: {
      /** Maximum length for "Other" text input */
      maxLength?: number
      /** Minimum length for "Other" text input */
      minLength?: number
      /** Regex pattern for "Other" text input */
      pattern?: string
      /** Custom error message when pattern fails */
      patternError?: string
    }
  }[]
}

/**
 * Search for string patterns in the project's files. This tool uses ripgrep (rg), a fast line-oriented search tool. Use this tool only when read_files is not sufficient to find the files you need.
 */
export interface CodeSearchParams {
  /** The pattern to search for. */
  pattern: string
  /** Optional ripgrep flags to customize the search (e.g., "-i" for case-insensitive, "-g *.ts -g *.js" for TypeScript and JavaScript files only, "-g !*.test.ts" to exclude Typescript test files,  "-A 3" for 3 lines after match, "-B 2" for 2 lines before match). */
  flags?: string
  /** Optional working directory to search within, relative to the project root. Defaults to searching the entire project. */
  cwd?: string
  /** Maximum number of results to return per file. Defaults to 15. There is also a global limit of 250 results across all files. */
  maxResults?: number
}

/**
 * End your turn, regardless of any new tool results that might be coming. This will allow the user to type another prompt.
 */
export interface EndTurnParams {}

/**
 * Find several files related to a brief natural language description of the files or the name of a function or class you are looking for.
 */
export interface FindFilesParams {
  /** A brief natural language description of the files or the name of a function or class you are looking for. It's also helpful to mention a directory or two to look within. */
  prompt: string
}

/**
 * Search for files matching a glob pattern. Returns matching file paths sorted by modification time.
 */
export interface GlobParams {
  /** Glob pattern to match files against (e.g., *.js, src/glob/*.ts, glob/test/glob/*.go). */
  pattern: string
  /** Optional working directory to search within, relative to project root. If not provided, searches from project root. */
  cwd?: string
}

/**
 * List files and directories in the specified path. Returns separate arrays of file names and directory names.
 */
export interface ListDirectoryParams {
  /** Directory path to list, relative to the project root. */
  path: string
}

/**
 * Retrieve information about an agent by ID
 */
export interface LookupAgentInfoParams {
  /** Agent ID (short local or full published format) */
  agentId: string
}

/**
 * Fetch up-to-date documentation for libraries and frameworks using Context7 API.
 */
export interface ReadDocsParams {
  /** The library or framework name (e.g., "Next.js", "MongoDB", "React"). Use the official name as it appears in documentation if possible. Only public libraries available in Context7's database are supported, so small or private libraries may not be available. */
  libraryTitle: string
  /** Specific topic to focus on (e.g., "routing", "hooks", "authentication") */
  topic: string
  /** Optional maximum number of tokens to return. Defaults to 20000. Values less than 10000 are automatically increased to 10000. */
  max_tokens?: number
}

/**
 * Read the multiple files from disk and return their contents. Use this tool to read as many files as would be helpful to answer the user's request.
 */
export interface ReadFilesParams {
  /** List of file paths to read. */
  paths: string[]
}

/**
 * Read one or more directory subtrees (as a blob including subdirectories, file names, and parsed variables within each source file) or return parsed variable names for files. If no paths are provided, returns the entire project tree.
 */
export interface ReadSubtreeParams {
  /** List of paths to directories or files. Relative to the project root. If omitted, the entire project tree is used. */
  paths?: string[]
  /** Maximum token budget for the subtree blob; the tree will be truncated to fit within this budget by first dropping file variables and then removing the most-nested files and directories. */
  maxTokens?: number
}

/**
 * Parameters for run_file_change_hooks tool
 */
export interface RunFileChangeHooksParams {
  /** List of file paths that were changed and should trigger file change hooks */
  files: string[]
}

/**
 * Execute a CLI command from the **project root** (different from the user's cwd).
 */
export interface RunTerminalCommandParams {
  /** CLI command valid for user's OS. */
  command: string
  /** Either SYNC (waits, returns output) or BACKGROUND (runs in background). Default SYNC */
  process_type?: 'SYNC' | 'BACKGROUND'
  /** The working directory to run the command in. Default is the project root. */
  cwd?: string
  /** Set to -1 for no timeout. Does not apply for BACKGROUND commands. Default 30 */
  timeout_seconds?: number
}

/**
 * Set the conversation history to the provided messages.
 */
export interface SetMessagesParams {
  messages: any
}

/**
 * JSON object to set as the agent output. This completely replaces any previous output. If the agent was spawned, this value will be passed back to its parent. If the agent has an outputSchema defined, the output will be validated against it.
 */
export interface SetOutputParams {}

/**
 * Spawn multiple agents and send a prompt and/or parameters to each of them. These agents will run in parallel. Note that that means they will run independently. If you need to run agents sequentially, use spawn_agents with one agent at a time instead.
 */
export interface SpawnAgentsParams {
  agents: {
    /** Agent to spawn */
    agent_type: string
    /** Prompt to send to the agent */
    prompt?: string
    /** Parameters object for the agent (if any) */
    params?: Record<string, any>
  }[]
}

/**
 * Replace strings in a file with new strings.
 */
export interface StrReplaceParams {
  /** The path to the file to edit. */
  path: string
  /** Array of replacements to make. */
  replacements: {
    /** The string to replace. This must be an *exact match* of the string you want to replace, including whitespace and punctuation. */
    old: string
    /** The string to replace the corresponding old string with. Can be empty to delete. */
    new: string
    /** Whether to allow multiple replacements of old string. */
    allowMultiple?: boolean
  }[]
}

/**
 * Suggest clickable followup prompts to the user.
 */
export interface SuggestFollowupsParams {
  /** List of suggested followup prompts the user can click to send */
  followups: {
    /** The full prompt text to send as a user message when clicked */
    prompt: string
    /** Short display label for the card (defaults to truncated prompt if not provided) */
    label?: string
  }[]
}

/**
 * Signal that the task is complete. Use this tool when:
- The user's request is completely fulfilled
- You need clarification from the user before continuing
- You are stuck or need help from the user to continue

This tool explicitly marks the end of your work on the current task.
 */
export interface TaskCompletedParams {}

/**
 * Deeply consider complex tasks by brainstorming approaches and tradeoffs step-by-step.
 */
export interface ThinkDeeplyParams {
  /** Detailed step-by-step analysis. Initially keep each step concise (max ~5-7 words per step). */
  thought: string
}

/**
 * Search the web for current information using Linkup API.
 */
export interface WebSearchParams {
  /** The search query to find relevant web content */
  query: string
  /** Search depth - 'standard' for quick results, 'deep' for more comprehensive search. Default is 'standard'. */
  depth?: 'standard' | 'deep'
}

/**
 * Create or edit a file with the given content.
 */
export interface WriteFileParams {
  /** Path to the file relative to the **project root** */
  path: string
  /** What the change is intended to do in only one sentence. */
  instructions: string
  /** Edit snippet to apply to the file. */
  content: string
}

/**
 * Write a todo list to track tasks for multi-step implementations. Use this frequently to maintain an updated step-by-step plan.
 */
export interface WriteTodosParams {
  /** List of todos with their completion status. Add ALL of the applicable tasks to the list, so you don't forget to do anything. Try to order the todos the same way you will complete them. Do not mark todos as completed if you have not completed them yet! */
  todos: {
    /** Description of the task */
    task: string
    /** Whether the task is completed */
    completed: boolean
  }[]
}

/**
 * Get parameters type for a specific tool
 */
export type GetToolParams<T extends ToolName> = ToolParamsMap[T]
