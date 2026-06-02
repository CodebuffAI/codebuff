/**
 * Union type of all available tool names
 */
export type ToolName =
  | 'apply_patch'
  | 'add_message'
  | 'ask_user'
  | 'code_search'
  | 'end_turn'
  | 'edit_transaction'
  | 'find_files'
  | 'glob'
  | 'gravity_index'
  | 'list_directory'
  | 'lookup_agent_info'
  | 'propose_edit_transaction'
  | 'propose_str_replace'
  | 'propose_write_file'
  | 'read_docs'
  | 'read_files'
  | 'read_proposal_workspace'
  | 'read_subtree'
  | 'replace_range'
  | 'render_ui'
  | 'run_file_change_hooks'
  | 'run_terminal_command'
  | 'set_messages'
  | 'set_output'
  | 'skill'
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
  apply_patch: ApplyPatchParams
  add_message: AddMessageParams
  ask_user: AskUserParams
  code_search: CodeSearchParams
  end_turn: EndTurnParams
  edit_transaction: EditTransactionParams
  find_files: FindFilesParams
  glob: GlobParams
  gravity_index: GravityIndexParams
  list_directory: ListDirectoryParams
  lookup_agent_info: LookupAgentInfoParams
  propose_edit_transaction: ProposeEditTransactionParams
  propose_str_replace: ProposeStrReplaceParams
  propose_write_file: ProposeWriteFileParams
  read_docs: ReadDocsParams
  read_files: ReadFilesParams
  read_proposal_workspace: ReadProposalWorkspaceParams
  read_subtree: ReadSubtreeParams
  replace_range: ReplaceRangeParams
  render_ui: RenderUiParams
  run_file_change_hooks: RunFileChangeHooksParams
  run_terminal_command: RunTerminalCommandParams
  set_messages: SetMessagesParams
  set_output: SetOutputParams
  skill: SkillParams
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
 * Apply a file operation (create, update, or delete).
 */
export interface ApplyPatchParams {
  /** The file operation to perform. type is one of create_file, update_file, or delete_file. */
  operation:
    | {
        type: 'create_file'
        path: string
        diff: string
      }
    | {
        type: 'update_file'
        path: string
        diff: string
        /** Required for large-file update patches. Provide one capability per touched hunk, copied from fresh read_files.ranges headers so the runtime can reject stale or out-of-range patch hunks before editing. */
        basedOnRead?: {
          /** 1-indexed inclusive start line from the read_files.ranges result this patch hunk is based on. */
          startLine: number
          /** 1-indexed inclusive end line from the read_files.ranges result this patch hunk is based on. */
          endLine: number
          /** The sha256 rangeHash returned by read_files.ranges for this exact range. */
          hash: string
        }[]
      }
    | {
        type: 'delete_file'
        path: string
      }
}

/**
 * Add a new message to the conversation history. To be used for complex requests that can't be solved in a single step, as you may forget what happened!
 */
export interface AddMessageParams {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Ask the user a list of multiple choice questions. Each question must have at least 2 options. The agent execution will pause until the user submits their answers.
 */
export interface AskUserParams {
  /** List of multiple choice questions to ask the user */
  questions: {
    /** The question to ask the user */
    question: string
    /** Short label (max 12 chars) displayed as a chip/tag. Example: "Auth method" */
    header?: string
    /** Array of answer options with label and optional description. */
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
 * Preflight related edits across one or more files as an atomic transaction, then apply the prepared file patches as one client-side batch.
 */
export interface EditTransactionParams {
  /** All edits that must preflight together. If any edit fails during preflight, no files are changed. */
  edits:
    | {
        /** Optional stable edit identifier echoed in diagnostics. */
        id?: string
        /** The file to edit. */
        path: string
        /** The edit operation type. */
        type: 'str_replace'
        /** String replacements to apply to this file. */
        replacements: {
          /** The string to replace. This must match the current file content exactly unless the deterministic near-match guard can prove one safe target. */
          oldString: string
          /** The string to replace the corresponding oldString with. Can be empty to delete. */
          newString: string
          /** Whether to allow multiple replacements of oldString. */
          allowMultiple?: boolean
          /** Optional range anchor from read_files.ranges. If fresh, it constrains matching to that range; if missing or stale on a large file, transaction preflight falls back to deterministic full-file oldString matching when it can identify exactly one safe target. */
          basedOnRead?:
            | string
            | {
                startLine: number
                endLine: number
                hash: string
              }
        }[]
      }
    | {
        /** Optional stable edit identifier echoed in diagnostics. */
        id?: string
        /** The file to edit. */
        path: string
        /** A structured edit dispatched by operation kind. */
        type: 'structured'
        /** Structured edit operation to apply to this file. */
        operation:
          | {
              /** Deterministic text insertion. */
              kind: 'insert_text'
              /** 1-indexed insertion position. */
              position: {
                /** 1-indexed target line. */
                line: number
                /** 1-indexed target column. */
                column: number
              }
              text: string
            }
          | {
              /** TypeScript-aware import insertion. */
              kind: 'insert_import'
              /** Complete TypeScript import statement to add, e.g. "import { foo } from 'bar'". */
              importStatement: string
            }
          | {
              /** TypeScript-aware import removal. */
              kind: 'remove_import'
              /** Complete TypeScript import statement to remove. Required unless moduleSpecifier is provided. */
              importStatement?: string
              /** Module specifier to remove imports from, e.g. "react" or "./helper". */
              moduleSpecifier?: string
            }
      }[]
}

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
 * Use the Gravity Index catalog and conversion API.
 */
export type GravityIndexParams =
  | {
      /** Search for the best service. */
      action: 'search'
      /** What the user needs, including stack, constraints, and required capabilities when known. Example: "serverless database with branching for a Next.js app". */
      query: string
      /** Continue a previous Gravity Index search as a follow-up. */
      search_id?: string
      /** Optional structured JSON context about the project, stack, or constraints. */
      context?: any
    }
  | {
      /** Browse catalog services by category and/or keyword. */
      action: 'browse'
      /** Optional category filter, e.g. Database, Auth, Payments, Hosting, Email, Cache, Monitoring, Analytics, AI, Storage, CMS, Search, Realtime, Background Jobs, Infrastructure, CRM, Support, Productivity, Commerce, Video, Webhooks, SMS. */
      category?: string
      /** Optional keyword filter, e.g. sendgrid or postgres. */
      q?: string
    }
  | {
      /** List every category with service counts. */
      action: 'list_categories'
    }
  | {
      /** Fetch full detail for a single service by slug. */
      action: 'get_service'
      /** Service slug, e.g. supabase, stripe, sendgrid. */
      slug: string
    }
  | {
      /** Report that an integration from a prior search was done. */
      action: 'report_integration'
      /** search_id from the earlier search result. */
      search_id: string
      /** Slug of the service that was actually integrated. */
      integrated_slug: string
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
 * Propose related edits across one or more files as an atomic transaction without applying them, returning preview diffs for review.
 */
export interface ProposeEditTransactionParams {
  /** All edits that must preflight together. If any edit fails during preflight, no preview diffs are produced. */
  edits:
    | {
        /** Optional stable edit identifier echoed in diagnostics. */
        id?: string
        /** The file to edit. */
        path: string
        /** The edit operation type. */
        type: 'str_replace'
        /** String replacements to apply to this file. */
        replacements: {
          /** The string to replace. This must match the current file content exactly unless the deterministic near-match guard can prove one safe target. */
          oldString: string
          /** The string to replace the corresponding oldString with. Can be empty to delete. */
          newString: string
          /** Whether to allow multiple replacements of oldString. */
          allowMultiple?: boolean
          /** Optional range anchor from read_files.ranges. If fresh, it constrains matching to that range; if missing or stale on a large file, transaction preflight falls back to deterministic full-file oldString matching when it can identify exactly one safe target. */
          basedOnRead?:
            | string
            | {
                startLine: number
                endLine: number
                hash: string
              }
        }[]
      }
    | {
        /** Optional stable edit identifier echoed in diagnostics. */
        id?: string
        /** The file to edit. */
        path: string
        /** A structured edit dispatched by operation kind. */
        type: 'structured'
        /** Structured edit operation to apply to this file. */
        operation:
          | {
              /** Deterministic text insertion. */
              kind: 'insert_text'
              /** 1-indexed insertion position. */
              position: {
                /** 1-indexed target line. */
                line: number
                /** 1-indexed target column. */
                column: number
              }
              text: string
            }
          | {
              /** TypeScript-aware import insertion. */
              kind: 'insert_import'
              /** Complete TypeScript import statement to add, e.g. "import { foo } from 'bar'". */
              importStatement: string
            }
          | {
              /** TypeScript-aware import removal. */
              kind: 'remove_import'
              /** Complete TypeScript import statement to remove. Required unless moduleSpecifier is provided. */
              importStatement?: string
              /** Module specifier to remove imports from, e.g. "react" or "./helper". */
              moduleSpecifier?: string
            }
      }[]
}

/**
 * Propose string replacements in a file without actually applying them.
 */
export interface ProposeStrReplaceParams {
  /** The path to the file to edit. */
  path: string
  /** Array of replacements to make. */
  replacements: {
    /** The string to replace. This must be an *exact match* of the string you want to replace, including whitespace and punctuation. */
    oldString: string
    /** The string to replace the corresponding oldString with. Can be empty to delete. */
    newString: string
    /** Whether to allow multiple replacements of oldString. */
    allowMultiple?: boolean
    /** Required when proposing edits to large files. Either the readCapability token from a fresh read_files range header (preferred), or { startLine, endLine, hash } from that header. Carried through to the real str_replace when the proposal is applied. */
    basedOnRead?:
      | string
      | {
          startLine: number
          endLine: number
          hash: string
        }
  }[]
}

/**
 * Propose creating or editing a file without actually applying the changes.
 */
export interface ProposeWriteFileParams {
  /** Path to the file relative to the **project root** */
  path: string
  /** What the change is intended to do in only one sentence. */
  instructions: string
  /** Complete file content to write to the file. */
  content: string
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
 * Read multiple files from disk and return their contents. Use this tool to read as many files as would be helpful to answer the user's request.
 */
export interface ReadFilesParams {
  /** List of file paths to read. */
  paths: string[]
  /** Optional: read only a 1-indexed inclusive line range of specific files. Use this to page through large files that exceeded the read limit. Each entry reads `path` from startLine..endLine. */
  ranges?: {
    /** File path to read a line range from, relative to the project root. */
    path: string
    /** 1-indexed inclusive start line. Defaults to 1. */
    startLine?: number
    /** 1-indexed inclusive end line. Defaults to the last line. */
    endLine?: number
  }[]
}

/**
 * Read files from your in-progress proposal workspace (your own proposed changes), not the real on-disk workspace.
 */
export interface ReadProposalWorkspaceParams {
  /** List of file paths to read from the proposal workspace. */
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
 * Replace a previously read line range only if its hash still matches.
 */
export interface ReplaceRangeParams {
  /** The path to the file to edit. */
  path: string
  /** 1-indexed inclusive start line from a fresh read_files.ranges result. */
  startLine: number
  /** 1-indexed inclusive end line from a fresh read_files.ranges result. */
  endLine: number
  /** The sha256 rangeHash returned by read_files.ranges for this exact range. */
  expectedHash: string
  /** Complete replacement content for the selected line range. */
  newContent: string
}

/**
 * Render a small interactive UI widget in the Openbuff CLI. Currently supports a button that opens a link.
 */
export interface RenderUiParams {
  /** The UI widget to render. */
  widget: {
    /** Widget type. Currently, the only supported widget is button. */
    type: 'button'
    /** Short button label shown to the user. */
    text: string
    /** The http:// or https:// URL to open when the user clicks the button. */
    link: string
    /** Theme-aware color treatment. Use primary for the main action and secondary for lower-emphasis actions. */
    variant?: 'primary' | 'secondary'
  }
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
 * JSON object to set as the agent output. The shape of the parameters are specified dynamically further down in the conversation. This completely replaces any previous output. If the agent was spawned, this value will be passed back to its parent. If the agent has an outputSchema defined, the output will be validated against it.
 */
export interface SetOutputParams {
  data?: Record<string, any>
  [key: string]: any
}

/**
 * Load a skill by name to get its full instructions. Skills provide reusable behaviors and instructions.
 */
export interface SkillParams {
  /** The name of the skill to load */
  name: string
}

/**
 * Spawn multiple agents and send a prompt and/or parameters to each of them. These agents will run in parallel. Note that that means they will run independently. If you need to run agents sequentially, use spawn_agents with one agent at a time instead.
 */
export interface SpawnAgentsParams {
  agents: {
    /** Agent to spawn */
    agent_type: string
    /** Prompt to send to the agent */
    prompt?: string
    /** Parameters object for the agent */
    params?: {
      /** Terminal command to run (basher, tmux-cli) */
      command?: string
      /** What information from the command output is desired (basher) */
      what_to_summarize?: string
      /** Timeout for command. Set to -1 for no timeout. Default 30 (basher) */
      timeout_seconds?: number
      /** Array of code search queries (code-searcher) */
      searchQueries?: {
        /** The pattern to search for */
        pattern: string
        /** Optional ripgrep flags (e.g., "-i", "-g *.ts") */
        flags?: string
        /** Optional working directory relative to project root */
        cwd?: string
        /** Max results per file. Default 15 */
        maxResults?: number
      }[]
      /** Relevant file paths to read (opus-agent, gpt-5-agent) */
      filePaths?: string[]
      /** Directories to search within (file-picker) */
      directories?: string[]
      /** Starting URL to navigate to (browser-use) */
      url?: string
      /** Array of strategy prompts (editor-multi-prompt, code-reviewer-multi-prompt) */
      prompts?: string[]
      [key: string]: any
    }
  }[]
}

/**
 * Replace strings in a file with new strings.
 */
export interface StrReplaceParams {
  /** The path to the file to edit. */
  path: string
  /** Whether to make the replacement batch all-or-nothing. If true, any failed replacement aborts the entire batch with no changes. Large-file edits are always atomic regardless of this setting. */
  atomic?: boolean
  /** Array of replacements to make. */
  replacements: {
    /** The string to replace. This must be an *exact match* of the string you want to replace, including whitespace and punctuation. */
    oldString: string
    /** The string to replace the corresponding oldString with. Can be empty to delete. */
    newString: string
    /** Whether to allow multiple replacements of oldString. */
    allowMultiple?: boolean
    /** Optional range anchor from read_files.ranges. If fresh, it constrains matching to that range; if missing or stale on a large file, the runtime falls back to full-file deterministic oldString matching when it can identify exactly one safe target. */
    basedOnRead?:
      | string
      | {
          /** 1-indexed inclusive start line from the read_files.ranges result this replacement is based on. */
          startLine: number
          /** 1-indexed inclusive end line from the read_files.ranges result this replacement is based on. */
          endLine: number
          /** The sha256 rangeHash returned by read_files.ranges for this exact range. */
          hash: string
        }
  }[]
}

/**
 * Suggest clickable followup prompts to the user. Each followup becomes a card the user can click to send that prompt.
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
 * Create or overwrite a file with the given content.
 */
export interface WriteFileParams {
  /** Path to the file relative to the **project root** */
  path: string
  /** What the change is intended to do in only one sentence. */
  instructions: string
  /** Complete file content to write to the file. */
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
