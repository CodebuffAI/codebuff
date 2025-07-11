import { FileChange } from '@codebuff/common/actions'
import { ToolName } from '@codebuff/common/constants/tools'
import { ProjectFileContext } from '@codebuff/common/util/file'
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
import { handleCreatePlan } from './handlers/create-plan'
import { handleEndTurn } from './handlers/end-turn'
import { handleFindFiles } from './handlers/find-files'
import { handleReadDocs } from './handlers/read-docs'
import { handleReadFiles } from './handlers/read-files'
import { handleRunFileChangeHooks } from './handlers/run-file-change-hooks'
import { handleRunTerminalCommand } from './handlers/run-terminal-command'
import { handleSpawnAgents } from './handlers/spawn-agents'
import { handleStrReplace } from './handlers/str-replace'
import { handleThinkDeeply } from './handlers/think-deeply'
import { handleUpdateReport } from './handlers/update-report'
import { handleUpdateSubgoal } from './handlers/update-subgoal'
import { handleWebSearch } from './handlers/web-search'
import { handleWriteFile } from './handlers/write-file'

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

type PresentOrAbsent<K extends PropertyKey, V> =
  | { [P in K]: V }
  | { [P in K]: never }

export type CodebuffToolHandlerFunction<T extends ToolName = ToolName> = (
  params: {
    previousToolCallFinished: Promise<void>
    toolCall: CodebuffToolCall<T>

    fileContext: ProjectFileContext
    agentStepId: string
    clientSessionId: string
    userInputId: string

    writeToClient: (chunk: string) => void
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
  create_plan: handleCreatePlan,
  end_turn: handleEndTurn,
  find_files: handleFindFiles,
  read_docs: handleReadDocs,
  read_files: handleReadFiles,
  run_file_change_hooks: handleRunFileChangeHooks,
  run_terminal_command: handleRunTerminalCommand,
  spawn_agents: handleSpawnAgents,
  str_replace: handleStrReplace,
  think_deeply: handleThinkDeeply,
  update_report: handleUpdateReport,
  update_subgoal: handleUpdateSubgoal,
  web_search: handleWebSearch,
  write_file: handleWriteFile,
} satisfies {
  [K in ToolName]: CodebuffToolHandlerFunction<K>
}

type CodebuffToolHandler<T extends ToolName = ToolName> = {
  [K in ToolName]: {
    toolName: K
    callback: (typeof codebuffToolHandlers)[K]
  }
}[T]

// WIP: Replacement for ServerToolResult
type CodebuffToolResult<T extends ToolName = ToolName> = {
  [K in ToolName]: {
    toolName: K
    result: Prettify<Awaited<ReturnType<CodebuffToolHandler<T>['callback']>>>
  }
}[T] &
  Omit<ToolResultPart, 'type'>
