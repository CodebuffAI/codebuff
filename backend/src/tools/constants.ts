import { ToolName } from '@codebuff/common/constants/tools'
import { ToolSet } from 'ai'
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

export type CodebuffToolDef = {
  toolName: ToolName
  parameters: z.ZodObject<any>
  description: string
  endsAgentStep: boolean
}

export const codebuffTools = {
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
} as const satisfies Record<ToolName, CodebuffToolDef> satisfies ToolSet

export const codebuffToolCallbacks = {
  add_subgoal: () => Promise.resolve(),
  browser_logs: () => Promise.resolve(),
  code_search: () => Promise.resolve(),
  create_plan: () => Promise.resolve(),
  end_turn: () => Promise.resolve(),
  find_files: () => Promise.resolve(),
  read_docs: () => Promise.resolve(),
  read_files: () => Promise.resolve(),
  run_file_change_hooks: () => Promise.resolve(),
  run_terminal_command: () => Promise.resolve(),
  spawn_agents: () => Promise.resolve(),
  str_replace: () => Promise.resolve(),
  think_deeply: () => Promise.resolve(),
  update_report: () => Promise.resolve(),
  update_subgoal: () => Promise.resolve(),
  web_search: () => Promise.resolve(),
  write_file: () => Promise.resolve(),
} satisfies Record<ToolName, () => Promise<any>>

export type CodebuffToolCallback = {
  [T in keyof typeof codebuffToolCallbacks]: {
    toolName: T
    callback: (typeof codebuffToolCallbacks)[T]
  }
}
