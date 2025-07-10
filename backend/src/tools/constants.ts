import { FileChange } from '@codebuff/common/actions'
import { ToolName } from '@codebuff/common/constants/tools'
import { ToolCallPart, ToolResultPart, ToolSet } from 'ai'
import z from 'zod/v4'
import { addSubgoalTool } from './definitions/add-subgoal'
import { browserLogsTool } from './definitions/browser-logs'
import { codeSearchTool } from './definitions/code-search'
import { createPlanTool } from './definitions/create-plan'
import { endTurnTool } from './definitions/end-turn'
import { findFilesTool } from './definitions/find-files'
import { readDocsTool } from './definitions/read-docs'
import { readFilesTool } from './definitions/read-files'
import { runFileChangeHooksTool } from './definitions/run-file-change-hooks'
import { runTerminalCommandTool } from './definitions/run-terminal-command'
import { spawnAgentsTool } from './definitions/spawn-agents'
import { strReplaceTool } from './definitions/str-replace'
import { thinkDeeplyTool } from './definitions/think-deeply'
import { updateReportTool } from './definitions/update-report'
import { updateSubgoalTool } from './definitions/update-subgoal'
import { webSearchTool } from './definitions/web-search'
import { writeFileTool } from './definitions/write-file'
import { handleAddSubgoal } from './handlers/add-subgoal'
import { handleBrowserLogs } from './handlers/browser-logs'
import { handleCodeSearch } from './handlers/code-search'
import { handleEndTurn } from './handlers/end-turn'
import { handleRunFileChangeHooks } from './handlers/run-file-change-hooks'
import { handleRunTerminalCommand } from './handlers/run-terminal-command'
import { handleUpdateSubgoal } from './handlers/update-subgoal'

type Prettify<T> = { [K in keyof T]: T[K] } & {}

export type CodebuffToolDef = {
  toolName: ToolName
  parameters: z.ZodObject<any>
  description: string
  endsAgentStep: boolean
}

export const codebuffToolDefs = {
  add_subgoal: addSubgoalTool,
  browser_logs: browserLogsTool,
  code_search: codeSearchTool,
  create_plan: createPlanTool,
  end_turn: endTurnTool,
  find_files: findFilesTool,
  read_docs: readDocsTool,
  read_files: readFilesTool,
  run_file_change_hooks: runFileChangeHooksTool,
  run_terminal_command: runTerminalCommandTool,
  spawn_agents: spawnAgentsTool,
  str_replace: strReplaceTool,
  think_deeply: thinkDeeplyTool,
  update_report: updateReportTool,
  update_subgoal: updateSubgoalTool,
  web_search: webSearchTool,
  write_file: writeFileTool,
} satisfies {
  [K in ToolName]: {
    toolName: K
  }
} & Record<ToolName, CodebuffToolDef> &
  ToolSet

// Tool call from LLM
export type CodebuffToolCall<T extends ToolName = ToolName> = {
  [K in ToolName]: {
    toolName: K
    args: z.infer<(typeof codebuffToolDefs)[K]['parameters']>
  } & Omit<ToolCallPart, 'type'>
}[T]

// Tool call to send to client
export type ClientToolCall<T extends ToolName = ToolName> = {
  [K in ToolName]: {
    toolName: K
    args: K extends 'run_terminal_command'
      ? CodebuffToolCall<'run_terminal_command'>['args'] & {
          mode: 'assistant' | 'user'
        }
      : K extends 'write_file' | 'str_replace' | 'create_plan'
        ? FileChange
        : CodebuffToolCall<K>['args']
  }
}[T] &
  Omit<ToolCallPart, 'type'>

// -- WIP NEW TOOL CALL FORMAT --

const WIP_TOOLS = [
  'create_plan',
  'find_files',
  'read_docs',
  'read_files',
  'spawn_agents',
  'str_replace',
  'think_deeply',
  'update_report',
  'web_search',
  'write_file',
] satisfies ToolName[]
type WIPTool = (typeof WIP_TOOLS)[number]
type NonWIPTool = Exclude<ToolName, WIPTool>

type PresentOrAbsent<K extends PropertyKey, V> =
  | { [P in K]: V }
  | { [P in K]: never }

export type CodebuffToolHandlerFunction<T extends NonWIPTool = NonWIPTool> = (
  params: {
    previousToolCallFinished: Promise<void>
    toolCall: CodebuffToolCall<T>
    state: { [K in string]?: any }
  } & PresentOrAbsent<
    'requestClientToolCall',
    (toolCall: ClientToolCall<T>) => Promise<string>
  >
) => { result: Promise<string>; state: Record<string, any> }

/**
 * Each value in this record that:
 * - Will be called immediately once it is parsed out of the stream.
 * - Takes as argument
 *   - The previous tool call (to await)
 *   - The CodebuffToolCall for the current tool
 *   - Any additional arguments for the tool
 * - Returns a promise that will be awaited
 */
const codebuffToolHandlers = {
  add_subgoal: handleAddSubgoal,
  browser_logs: handleBrowserLogs,
  code_search: handleCodeSearch,
  end_turn: handleEndTurn,
  run_file_change_hooks: handleRunFileChangeHooks,
  run_terminal_command: handleRunTerminalCommand,
  update_subgoal: handleUpdateSubgoal,
} satisfies {
  [K in NonWIPTool]: CodebuffToolHandlerFunction<K>
}

type CodebuffToolHandler<T extends NonWIPTool = NonWIPTool> = {
  [K in NonWIPTool]: {
    toolName: K
    callback: (typeof codebuffToolHandlers)[K]
  }
}[T]

// WIP: Replacement for ServerToolResult
type CodebuffToolResult<T extends NonWIPTool = NonWIPTool> = {
  [K in ToolName]: {
    toolName: K
    result: Prettify<Awaited<ReturnType<CodebuffToolHandler<T>['callback']>>>
  }
}[T] &
  Omit<ToolResultPart, 'type'>
