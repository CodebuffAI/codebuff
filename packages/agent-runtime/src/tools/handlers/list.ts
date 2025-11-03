import { handleAddMessage } from './tool/add-message'
import { handleAddSubgoal } from './tool/add-subgoal'
import { handleBrowserLogs } from './tool/browser-logs'
import { handleCodeSearch } from './tool/code-search'
import { handleCreatePlan } from './tool/create-plan'
import { handleEndTurn } from './tool/end-turn'
import { handleFindFiles } from './tool/find-files'
import { handleGlob } from './tool/glob'
import { handleListDirectory } from './tool/list-directory'
import { handleLookupAgentInfo } from './tool/lookup-agent-info'
import { handleReadDocs } from './tool/read-docs'
import { handleReadFiles } from './tool/read-files'
import { handleReadSubtree } from './tool/read-subtree'
import { handleRunFileChangeHooks } from './tool/run-file-change-hooks'
import { handleRunTerminalCommand } from './tool/run-terminal-command'
import { handleSetMessages } from './tool/set-messages'
import { handleSetOutput } from './tool/set-output'
import { handleSpawnAgentInline } from './tool/spawn-agent-inline'
import { handleSpawnAgents } from './tool/spawn-agents'
import { handleStrReplace } from './tool/str-replace'
import { handleTaskCompleted } from './tool/task-completed'
import { handleThinkDeeply } from './tool/think-deeply'
import { handleUpdateSubgoal } from './tool/update-subgoal'
import { handleWebSearch } from './tool/web-search'
import { handleWriteFile } from './tool/write-file'
import { handleWriteTodos } from './tool/write-todos'

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
  browser_logs: handleBrowserLogs,
  code_search: handleCodeSearch,
  create_plan: handleCreatePlan,
  end_turn: handleEndTurn,
  find_files: handleFindFiles,
  glob: handleGlob,
  list_directory: handleListDirectory,
  lookup_agent_info: handleLookupAgentInfo,
  read_docs: handleReadDocs,
  read_files: handleReadFiles,
  read_subtree: handleReadSubtree,
  run_file_change_hooks: handleRunFileChangeHooks,
  run_terminal_command: handleRunTerminalCommand,
  set_messages: handleSetMessages,
  set_output: handleSetOutput,
  spawn_agents: handleSpawnAgents,
  spawn_agent_inline: handleSpawnAgentInline,
  str_replace: handleStrReplace,
  task_completed: handleTaskCompleted,
  think_deeply: handleThinkDeeply,
  update_subgoal: handleUpdateSubgoal,
  web_search: handleWebSearch,
  write_file: handleWriteFile,
  write_todos: handleWriteTodos,
} satisfies {
  [K in ToolName]: CodebuffToolHandlerFunction<K>
}
