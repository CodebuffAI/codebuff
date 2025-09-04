import { handleAddMessage } from './tool/add-message'
import { handleAddSubgoal } from './tool/add-subgoal'
import { handleAnalyzeTestRequirements } from './tool/analyze-test-requirements'
import { handleBrowserLogs } from './tool/browser-logs'
import { handleCodeSearch } from './tool/code-search'
import { handleCreatePlan } from './tool/create-plan'
import { handleCreateTaskChecklist } from './tool/create-task-checklist'
import { handleEndTurn } from './tool/end-turn'
import { handleFindFiles } from './tool/find-files'
import { handleReadDocs } from './tool/read-docs'
import { handleReadFiles } from './tool/read-files'
import { handleRunFileChangeHooks } from './tool/run-file-change-hooks'
import { handleRunTerminalCommand } from './tool/run-terminal-command'
import { handleSetMessages } from './tool/set-messages'
import { handleSetOutput } from './tool/set-output'
import { handleSmartFindFiles } from './tool/smart-find-files'
import { handleSpawnAgents } from './tool/spawn-agents'
import { handleSpawnAgentsAsync } from './tool/spawn-agents-async'
import { handleSpawnAgentInline } from './tool/spawn-agent-inline'
import { handleStrReplace } from './tool/str-replace'
import { handleThinkDeeply } from './tool/think-deeply'
import { handleUpdateSubgoal } from './tool/update-subgoal'
import { handleWebSearch } from './tool/web-search'
import { handleWriteFile } from './tool/write-file'

import type { CodebuffToolHandlerFunction } from './handler-function-type'
import type { ToolName } from '@codebuff/common/tools/constants'

/**
 * Each value in this record that:
 * - Will be called immediately once it is parsed out of the stream.
 * - Takes as argument
 *   - The previous tool call (to await)
 *   - The CodebuffToolCall for the current tool
 *   - Any additional arguments for the tool
 * - Returns a promise that will be awaited
 */
export const codebuffToolHandlers = {
  add_message: handleAddMessage,
  add_subgoal: handleAddSubgoal,
  analyze_test_requirements: handleAnalyzeTestRequirements,
  browser_logs: handleBrowserLogs,
  code_search: handleCodeSearch,
  create_plan: handleCreatePlan,
  create_task_checklist: handleCreateTaskChecklist,
  end_turn: handleEndTurn,
  find_files: handleFindFiles,
  read_docs: handleReadDocs,
  read_files: handleReadFiles,
  run_file_change_hooks: handleRunFileChangeHooks,
  run_terminal_command: handleRunTerminalCommand,
  set_messages: handleSetMessages,
  set_output: handleSetOutput,
  smart_find_files: handleSmartFindFiles,
  spawn_agents: handleSpawnAgents,
  spawn_agents_async: handleSpawnAgentsAsync,
  spawn_agent_inline: handleSpawnAgentInline,
  str_replace: handleStrReplace,
  think_deeply: handleThinkDeeply,
  update_subgoal: handleUpdateSubgoal,
  web_search: handleWebSearch,
  write_file: handleWriteFile,
} satisfies {
  [K in ToolName]: CodebuffToolHandlerFunction<K>
}
