import { $toolParams } from '@codebuff/common/tools/list'

import { addMessageTool } from './tool/add-message'
import { addSubgoalTool } from './tool/add-subgoal'
import { browserLogsTool } from './tool/browser-logs'
import { codeSearchTool } from './tool/code-search'
import { createPlanTool } from './tool/create-plan'
import { endTurnTool } from './tool/end-turn'
import { findFilesTool } from './tool/find-files'
import { globTool } from './tool/glob'
import { listDirectoryTool } from './tool/list-directory'
import { lookupAgentInfoTool } from './tool/lookup-agent-info'
import { readDocsTool } from './tool/read-docs'
import { readFilesTool } from './tool/read-files'
import { readSubtreeTool } from './tool/read-subtree'
import { runFileChangeHooksTool } from './tool/run-file-change-hooks'
import { runTerminalCommandTool } from './tool/run-terminal-command'
import { setMessagesTool } from './tool/set-messages'
import { setOutputTool } from './tool/set-output'
import { spawnAgentInlineTool } from './tool/spawn-agent-inline'
import { spawnAgentsTool } from './tool/spawn-agents'
import { strReplaceTool } from './tool/str-replace'
import { taskCompletedTool } from './tool/task-completed'
import { thinkDeeplyTool } from './tool/think-deeply'
import { updateSubgoalTool } from './tool/update-subgoal'
import { webSearchTool } from './tool/web-search'
import { writeFileTool } from './tool/write-file'
import { writeTodosTool } from './tool/write-todos'

import type { ToolDescription } from './tool-def-type'
import type { ToolName } from '@codebuff/common/tools/constants'
import type { ToolSet } from 'ai'

const toolDescriptions = {
  add_message: addMessageTool,
  add_subgoal: addSubgoalTool,
  browser_logs: browserLogsTool,
  code_search: codeSearchTool,
  create_plan: createPlanTool,
  end_turn: endTurnTool,
  find_files: findFilesTool,
  glob: globTool,
  list_directory: listDirectoryTool,
  lookup_agent_info: lookupAgentInfoTool,
  read_docs: readDocsTool,
  read_files: readFilesTool,
  read_subtree: readSubtreeTool,
  run_file_change_hooks: runFileChangeHooksTool,
  run_terminal_command: runTerminalCommandTool,
  set_messages: setMessagesTool,
  set_output: setOutputTool,
  spawn_agents: spawnAgentsTool,
  spawn_agent_inline: spawnAgentInlineTool,
  str_replace: strReplaceTool,
  task_completed: taskCompletedTool,
  think_deeply: thinkDeeplyTool,
  update_subgoal: updateSubgoalTool,
  web_search: webSearchTool,
  write_file: writeFileTool,
  write_todos: writeTodosTool,
} satisfies {
  [K in ToolName]: ToolDescription<K>
}

export type ToolDefinition<T extends ToolName = ToolName> = {
  [K in ToolName]: (typeof toolDescriptions)[K] & (typeof $toolParams)[K]
}[T]

export const codebuffToolDefs = Object.fromEntries(
  Object.entries(toolDescriptions).map(([toolName, toolDescription]) => [
    toolName,
    {
      ...toolDescriptions[toolName as ToolName],
      ...$toolParams[toolName as ToolName],
    } satisfies ToolDefinition,
  ]),
) as { [K in ToolName]: ToolDefinition<K> } satisfies ToolSet
