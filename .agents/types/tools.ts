/**
 * Union type of all available tool names
 */
export type ToolName =
  | 'apply_patch'
  | 'apply_smart_patch'
  | 'add_message'
  | 'ask_user'
  | 'check_background_agent'
  | 'check_job'
  | 'code_search'
  | 'end_turn'
  | 'edit_transaction'
  | 'find_files'
  | 'find_files_matching_content'
  | 'git_status'
  | 'glob'
  | 'kill_job'
  | 'list_directory'
  | 'lookup_agent_info'
  | 'propose_edit_transaction'
  | 'propose_str_replace'
  | 'propose_write_file'
  | 'query_index'
  | 'read_docs'
  | 'read_files'
  | 'read_image'
  | 'read_logs'
  | 'read_outline'
  | 'read_slices'
  | 'read_proposal_workspace'
  | 'read_subtree'
  | 'replace_range'
  | 'rewrite_symbol'
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
  | 'update_plan_status'
  | 'web_search'
  | 'write_file'
  | 'write_todos'

/**
 * Map of tool names to their parameter types
 */
export interface ToolParamsMap {
  apply_patch: ApplyPatchParams
  apply_smart_patch: ApplySmartPatchParams
  add_message: AddMessageParams
  ask_user: AskUserParams
  check_background_agent: CheckBackgroundAgentParams
  check_job: CheckJobParams
  code_search: CodeSearchParams
  end_turn: EndTurnParams
  edit_transaction: EditTransactionParams
  find_files: FindFilesParams
  find_files_matching_content: FindFilesMatchingContentParams
  git_status: GitStatusParams
  glob: GlobParams
  kill_job: KillJobParams
  list_directory: ListDirectoryParams
  lookup_agent_info: LookupAgentInfoParams
  propose_edit_transaction: ProposeEditTransactionParams
  propose_str_replace: ProposeStrReplaceParams
  propose_write_file: ProposeWriteFileParams
  query_index: QueryIndexParams
  read_docs: ReadDocsParams
  read_files: ReadFilesParams
  read_image: ReadImageParams
  read_logs: ReadLogsParams
  read_outline: ReadOutlineParams
  read_slices: ReadSlicesParams
  read_proposal_workspace: ReadProposalWorkspaceParams
  read_subtree: ReadSubtreeParams
  replace_range: ReplaceRangeParams
  rewrite_symbol: RewriteSymbolParams
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
  update_plan_status: UpdatePlanStatusParams
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
          /** 1-indexed inclusive start line from the read_files.ranges result this anchor covers. */
          startLine: number
          /** 1-indexed inclusive end line from the read_files.ranges result this anchor covers. */
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
 * Apply a smart self-healing unified diff patch with fuzzy line alignment, AST-aware syntax auto-correction, and preflight compile validation.
 */
export interface ApplySmartPatchParams {
  /** File path to apply the smart patch to, relative to the project root. */
  path: string
  /** The unified diff patch hunk(s) containing the changes. Lines prefixed with - are deleted, lines with + are inserted, and lines with space are context. */
  patch: string
  /** Max lines of surrounding context displacement to allow when matching target patch region (Layer B). */
  fuzzFactor?: number
  /** If true, auto-heal minor syntax formatting or closing/bracket mismatches (Layer C). */
  autoHeal?: boolean
  /** If true, run virtual preflight syntax/compile checks before writing changes to disk. */
  preflightCompile?: boolean
  /** If true, apply a hunk at its line number when no unique fuzzy match is found. Defaults to false so smart patches fail closed instead of risking misplaced edits. */
  allowPositionalFallback?: boolean
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
 * Poll or follow a background agent turn started by spawn_agents({ background: true }): returns the streamed chunks produced since the last check plus the job status. Use it to observe a long-running background agent without blocking the turn.
 */
export interface CheckBackgroundAgentParams {
  /** The jobId returned by spawn_agents({ background: true }) for the background agent turn. */
  jobId: string
  /** Optional substring to wait for in the new streamed chunks before returning (follow mode). Returns early as soon as it appears in any chunk payload. Useful for waiting until a background agent emits a specific milestone (e.g. a tool_result or a text marker). */
  wait_for?: string
  /** Max seconds to wait for new chunks / the wait_for pattern. 0 (default) returns immediately with whatever new chunks exist (poll mode); >0 blocks up to this long (follow mode). */
  timeout_seconds?: number
}

/**
 * Poll or follow a background job started by run_terminal_command: returns the output produced since the last check plus the job status and exit code. Use it to observe a long-running process without blocking the turn. To watch an arbitrary log file, start a `tail -f <file>` BACKGROUND job and check_job it with a wait_for pattern.
 */
export interface CheckJobParams {
  /** The jobId returned by run_terminal_command with process_type: BACKGROUND. */
  jobId: string
  /** Optional substring to wait for in the new output before returning (follow mode). Returns early as soon as it appears (e.g. "Listening on" / "compiled successfully"). */
  wait_for?: string
  /** Max seconds to wait for new output / the wait_for pattern. 0 (default) returns immediately with whatever new output exists (poll mode); >0 blocks up to this long (follow mode). */
  timeout_seconds?: number
  /** Follow mode only: when the follow-timeout fires (deadline reached, wait_for not yet matched, job still running) send SIGTERM to the background job and reflect the post-kill status/exitCode plus `killed: true` in the result. Defaults to true. Set to false to keep the job alive (e.g. so you can poll it again later). Poll mode (timeout_seconds 0/omitted) never kills regardless of this flag. */
  kill_on_timeout?: boolean
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
          /** Optional 1-indexed exact occurrence to replace when oldString appears multiple times. Matches str_replace occurrenceIndex semantics and may be combined with basedOnRead to count only within an anchored range. */
          occurrenceIndex?: number
          /** Optional range anchor from a fresh read_files call. Presence bypasses strict read-before-edit for the target path without requiring a prior read_files call in the same turn. Accepts either the readCapability token copied verbatim from a fresh read_files range header (preferred; one value to copy instead of three), or the explicit { startLine, endLine, hash } object from that header. The runtime does NOT verify the supplied hash against current disk content; the upstream read_files call is the trust anchor. */
          basedOnRead?:
            | string
            | {
                /** 1-indexed inclusive start line from the read_files.ranges result this anchor covers. */
                startLine: number
                /** 1-indexed inclusive end line from the read_files.ranges result this anchor covers. */
                endLine: number
                /** The sha256 rangeHash returned by read_files.ranges for this exact range. */
                hash: string
              }
          /** For deletion replacements only (newString is empty): treat a missing oldString as an already-applied no-op. Use only for explicit idempotent cleanup retries, never for ordinary edits. */
          skipIfMissing?: boolean
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
 * List unique file paths whose content matches a pattern, with optional symbol grouping. Built on top of ripgrep (rg).
 */
export interface FindFilesMatchingContentParams {
  /** Regex pattern (ripgrep syntax) to match file content against. */
  pattern: string
  /** Optional safe ripgrep flags. Allowed: -i/--ignore-case, -S/--smart-case, -s/--case-sensitive, -w/--word-regexp, -F/--fixed-strings, -U/--multiline, --multiline-dotall, -g/--glob, -t/--type, -T/--type-not. Examples: "-i", "-g *.ts -g *.tsx", "-g !*.test.ts", "-F". Use code_search for advanced ripgrep options. */
  flags?: string
  /** Optional working directory to search within, relative to the project root. Defaults to the project root. */
  cwd?: string
  /** Maximum number of unique files to return. Defaults to 100. */
  maxFiles?: number
  /** When true, also return the names of the top-level symbols (functions, classes, methods, exports, constants) that contain each match, plus the per-file match count. Symbol extraction is heuristic and works best for JS/TS/Python/Go/Rust source files; languages without a recognized declaration shape produce an empty symbols list. */
  groupBySymbol?: boolean
  /** Maximum seconds to let ripgrep run before returning partial results. Defaults to 15. */
  timeoutSeconds?: number
}

/**
 * Read-only git status and (optionally) diff for the current project.
 */
export interface GitStatusParams {
  /** When true, also return the unified diff of uncommitted changes. */
  include_diff?: boolean
  /** When true with include_diff, returns the staged diff instead of unstaged. */
  staged?: boolean
  /** Optional path to scope status/diff to (relative to project root). */
  path?: string
  /** Maximum characters of diff output to return. Defaults to 40,000. */
  max_chars?: number
}

/**
 * Search for files matching a glob pattern. Returns matching file paths sorted by modification time.
 */
export interface GlobParams {
  /** Glob pattern to match files against (e.g., *.js, src/glob/*.ts, glob/test/glob/*.go). */
  pattern: string
  /** Optional working directory to search within, relative to project root. If provided, the glob pattern is matched against paths relative to this cwd, while returned files remain project-relative. If not provided, searches from project root. */
  cwd?: string
}

/**
 * Cancel a background job started by run_terminal_command.
 */
export interface KillJobParams {
  /** The jobId returned by run_terminal_command with process_type: BACKGROUND. */
  jobId: string
  /** Signal to send. Defaults to SIGTERM; use SIGKILL only if graceful termination fails. */
  signal?: 'SIGTERM' | 'SIGKILL'
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
          /** Optional 1-indexed exact occurrence to replace when oldString appears multiple times. Matches str_replace occurrenceIndex semantics and may be combined with basedOnRead to count only within an anchored range. */
          occurrenceIndex?: number
          /** Optional range anchor from a fresh read_files call. Presence bypasses strict read-before-edit for the target path without requiring a prior read_files call in the same turn. Accepts either the readCapability token copied verbatim from a fresh read_files range header (preferred; one value to copy instead of three), or the explicit { startLine, endLine, hash } object from that header. The runtime does NOT verify the supplied hash against current disk content; the upstream read_files call is the trust anchor. */
          basedOnRead?:
            | string
            | {
                /** 1-indexed inclusive start line from the read_files.ranges result this anchor covers. */
                startLine: number
                /** 1-indexed inclusive end line from the read_files.ranges result this anchor covers. */
                endLine: number
                /** The sha256 rangeHash returned by read_files.ranges for this exact range. */
                hash: string
              }
          /** For deletion replacements only (newString is empty): treat a missing oldString as an already-applied no-op. Use only for explicit idempotent cleanup retries, never for ordinary edits. */
          skipIfMissing?: boolean
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
    /** Optional range anchor from a fresh read_files call. Presence bypasses strict read-before-edit for the target path without requiring a prior read_files call in the same turn. Accepts either the readCapability token copied verbatim from a fresh read_files range header (preferred; one value to copy instead of three), or the explicit { startLine, endLine, hash } object from that header. The runtime does NOT verify the supplied hash against current disk content; the upstream read_files call is the trust anchor. */
    basedOnRead?:
      | string
      | {
          /** 1-indexed inclusive start line from the read_files.ranges result this anchor covers. */
          startLine: number
          /** 1-indexed inclusive end line from the read_files.ranges result this anchor covers. */
          endLine: number
          /** The sha256 rangeHash returned by read_files.ranges for this exact range. */
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
 * Query the local codebase graph index to find relevant files ranked by symbol names, imports, headings, paths, doc concepts, and graph relationships. The index is built automatically on startup.
 */
export interface QueryIndexParams {
  /** Natural language query or keyword terms describing the files you are looking for. Optional for graph modes when from/to paths are provided. For example: "authentication", "database migrations", "editor proposal logic", "React components". */
  query?: string
  /** Maximum number of results to return. Defaults to 20. */
  limit?: number
  /** Optional list of file extensions to filter results (without dot). E.g. ["ts", "tsx"] for TypeScript only. */
  fileTypes?: string[]
  /** Query mode. search returns ranked files, explain includes ranking rationale, neighbors returns adjacent graph files, path returns a graph path between files, commands prioritizes package scripts, CI workflows, task runners, and validation docs, and references returns files that import or call into a seed file (blast-radius analysis before editing an exported symbol). */
  mode?: 'search' | 'neighbors' | 'path' | 'explain' | 'commands' | 'references'
  /** Optional source file path for neighbors, path, and references modes. */
  from?: string
  /** Optional target file path for path mode. */
  to?: string
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
  /** List of file paths to read. Batch results include a separate summary entry with ok/failed/requested counts when available. */
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
  /** Optional: instead of (or in addition to) whole files, pull just the implementation slices for named symbols. Prefer this over a full read when you already know which functions/classes you need, especially in large files. Each returned slice includes its line range and a readCapability you can reuse as basedOnRead on a later edit. */
  symbols?: {
    /** File path to extract symbol slices from, relative to the project root. */
    path: string
    /** Symbol names (functions, classes, interfaces, methods) to slice. */
    names: string[]
  }[]
}

/**
 * Read image files from disk and return them as model-visible image media.
 */
export interface ReadImageParams {
  /** List of image file paths to read. */
  paths: string[]
}

/**
 * Read the last N lines from a log/text file or background job log without starting a background tail process.
 */
export interface ReadLogsParams {
  /** Path to the log file, relative to the project root unless absolute. Required unless jobId is provided. */
  path?: string
  /** Background job id returned by run_terminal_command(process_type: BACKGROUND). When provided, reads the job log file directly. */
  jobId?: string
  /** Number of trailing lines to read. Defaults to 200. */
  lines?: number
  /** Maximum characters to return. Defaults to 20,000. */
  max_chars?: number
}

/**
 * Generate an outline of imports, exports, classes, methods, and function signatures in a source file without reading the entire implementation.
 */
export interface ReadOutlineParams {
  /** File path to generate the AST-like outline for, relative to the project root. */
  path: string
}

/**
 * Read only the specific implementation/code slices for specified symbol names in a file rather than the whole file.
 */
export interface ReadSlicesParams {
  /** File path to extract slices from, relative to the project root. */
  path: string
  /** Symbol names (functions, classes, interfaces, methods) to extract code slices for. */
  symbols: string[]
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
 * Replace a whole symbol's definition by name using the file's syntax tree, without copying its current text. Resolves the exact AST range and applies it through the safe str_replace path (atomic, anchored).
 */
export interface RewriteSymbolParams {
  /** File path containing the symbol, relative to the project root. */
  path: string
  /** Name of the function/class/method/type/interface to replace (as shown by read_outline). */
  symbol: string
  /** The complete new source for the symbol, replacing its entire current definition (e.g. the whole function including its signature and body). Provide REAL newlines/tabs in the string — literal backslash-n (\n) and backslash-t (\t) sequences are not interpreted and will be written verbatim into the file. This matches str_replace. */
  content: string
  /** When multiple top-level symbols share this name, the 1-indexed one to replace. */
  occurrence?: number
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
  /** Either SYNC (waits, returns output) or BACKGROUND (starts a detached job and returns immediately with a jobId — poll/follow it with check_job). Use BACKGROUND for long-running or never-exiting processes (dev servers, watchers, log tails) so you don't block the turn. Default SYNC */
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
    /** If true, launch the agent detached from this turn. spawn_agents returns immediately with a jobId; the agent runs as an in-process coroutine. Poll its progress with check_background_agent. Use for long-running, non-blocking work (e.g. indexing, eval runs, multi-step research) where you do not need the result before ending your turn. The background agent shares the same process so it cannot outlive this CLI session. Defaults to false (blocking). */
    background?: boolean
    /** Optional structured handoff payload. Purely additive — children that do not consume `handoff` continue to receive `prompt` and `params` as before. */
    handoff?: {
      /** Short, plain-language summary of what the parent has already done and what it expects the child to do next. */
      summary?: string
      /** Paths to durable artifacts the child should treat as authoritative (e.g. .agents/sessions/<slug>/PLAN.md). */
      artifacts?: string[]
      /** Bulleted acceptance criteria for the spawned child agent. */
      successCriteria?: string[]
      /** Explicit non-goals that the child must not attempt. */
      nonGoals?: string[]
      /** Hard constraints (e.g. allowed paths, safety/scope rails). Children should reject work that violates these. */
      constraints?: string[]
      /** Free-form structured context. Opaque to spawn_agents; the child agent may interpret as needed. */
      context?: Record<string, any>
    }
    /** Per-spawn wall-clock timeout override for this subagent, in seconds. Set to -1 to disable the timeout entirely (genuinely long-running agents). Defaults to the agent template's defaultTimeoutMs, or 20 minutes if unset. */
    timeout_seconds?: number
    /** Parameters object for the agent */
    params?: {
      /** Terminal command to run (basher, tmux-cli) */
      command?: string
      /** What information from the command output is desired (basher) */
      what_to_summarize?: string
      /** Timeout for command. Set to -1 for no timeout. Default 30 (basher) */
      timeout_seconds?: number
      /** Save full command output to a /tmp log and extract failure lines for long SYNC command output (basher) */
      save_full_log?: boolean
      /** grep -E failure extraction pattern used with save_full_log (basher) */
      failure_pattern?: string
      /** Maximum extracted failure lines to return with save_full_log (basher) */
      max_failure_lines?: number
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
      /** Relevant file paths to read (general-agent) */
      filePaths?: string[]
      /** Directories to search within (file-picker) */
      directories?: string[]
      /** Starting URL to navigate to (browser-use) */
      url?: string
      /** Optional agent-specific prompts */
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
    /** When oldString appears multiple times, target exactly the Nth (1-indexed) occurrence. Lets you disambiguate repeated text without a re-read or a longer oldString. Requires an exact literal match (no near-match correction) and fails cleanly if fewer than N occurrences exist. If a fresh basedOnRead range is also given, occurrences are counted within that range. */
    occurrenceIndex?: number
    /** Optional range anchor from a fresh read_files call. Presence bypasses strict read-before-edit for the target path without requiring a prior read_files call in the same turn. Accepts either the readCapability token copied verbatim from a fresh read_files range header (preferred; one value to copy instead of three), or the explicit { startLine, endLine, hash } object from that header. The runtime does NOT verify the supplied hash against current disk content; the upstream read_files call is the trust anchor. */
    basedOnRead?:
      | string
      | {
          /** 1-indexed inclusive start line from the read_files.ranges result this anchor covers. */
          startLine: number
          /** 1-indexed inclusive end line from the read_files.ranges result this anchor covers. */
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
 * Parameters for update_plan_status tool
 */
export interface UpdatePlanStatusParams {
  /** Artifact path. Must be `.agents/sessions/<slug>/PLAN.md`, `.agents/sessions/<slug>/STATUS.md`, or `.agents/sessions/<slug>/LESSONS.md`. Absolute paths and `..` traversal are rejected. Editing PLAN.md is permitted only for tri-state task toggles (not full overwrites). */
  path: string
  /** Targeted updates applied in order. Each entry rewrites at most one matching checklist line; unmatched updates fall through to `append`. */
  updates?: {
    /** Substring of the existing task/checklist line to match (case-insensitive). The first matching `- [ ]`/`-[x]`/`-[~]`/`-[/]`/`-[!]` line in the artifact will be updated in place. */
    task: string
    /** When provided, sets the checkbox state of the matched line (true -> `[x]`, false -> `[ ]`). Ignored when `status` is also provided. */
    completed?: boolean
    /** Explicit tri-state task status. When provided, overrides `completed`. Transitions a task to `in_progress` (`[~]`), `done` (`[x]`), `cancelled` (`[/]`), `blocked` (`[!]`), or back to `pending` (`[ ]`). */
    status?: 'pending' | 'in_progress' | 'done' | 'cancelled' | 'blocked'
    /** Optional short note to append to the matched line in parentheses. Preserves any existing trailing text on the line. */
    note?: string
  }[]
  /** Optional delimited entry appended at the end of the artifact (used when there is no matching task line for the change being recorded). */
  append?: {
    /** Short heading for an appended entry. Used to form a clearly delimited block (`## <heading> — <timestamp>`). */
    heading: string
    /** Markdown body for the appended entry. Written verbatim under the heading. */
    body: string
  }
  /** Optional session-level status transition. When provided, `.agents/sessions/<slug>/STATE.json` is created or updated to reflect the new lifecycle status. */
  sessionStatus?: 'active' | 'paused' | 'completed' | 'archived'
  /** Optional current-task pointer written as a `<!-- current-task: <task> -->` annotation in PLAN.md. Pass an empty string or omit to clear the pointer. Only takes effect when path targets PLAN.md. */
  currentTask?: string
}

/**
 * Search the web for current information, or fetch the content of a specific URL.
 */
export interface WebSearchParams {
  /** The search query to find relevant web content. Required unless url is provided. */
  query?: string
  /** A specific URL to fetch and read the full text content of. When provided, fetches this page directly instead of searching. Useful for reading documentation, GitHub READMEs, blog posts, or any public web page. */
  url?: string
  /** Search depth - 'standard' for quick results, 'deep' for more comprehensive search. Default is 'standard'. Ignored when url is provided. */
  depth?: 'standard' | 'deep'
  /** When fetching a URL, also extract and return links found on the page. Enables navigation by letting you see what pages are linked. Default: true. */
  include_links?: boolean
  /** Maximum number of links to extract when include_links is true. Default: 40. */
  max_links?: number
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
  /** Optional range anchor from a fresh read_files call. Presence bypasses strict read-before-edit for the target path without requiring a prior read_files call in the same turn. Accepts either the readCapability token copied verbatim from a fresh read_files range header (preferred; one value to copy instead of three), or the explicit { startLine, endLine, hash } object from that header. The runtime does NOT verify the supplied hash against current disk content; the upstream read_files call is the trust anchor. */
  basedOnRead?:
    | string
    | {
        /** 1-indexed inclusive start line from the read_files.ranges result this anchor covers. */
        startLine: number
        /** 1-indexed inclusive end line from the read_files.ranges result this anchor covers. */
        endLine: number
        /** The sha256 rangeHash returned by read_files.ranges for this exact range. */
        hash: string
      }
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
