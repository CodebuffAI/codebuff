import { handleAddMessage } from '@codebuff/agent-runtime/tools/handlers/tool/add-message'
import { handleAddSubgoal } from '@codebuff/agent-runtime/tools/handlers/tool/add-subgoal'
import { handleBrowserLogs } from '@codebuff/agent-runtime/tools/handlers/tool/browser-logs'
import { handleCodeSearch } from '@codebuff/agent-runtime/tools/handlers/tool/code-search'
import { handleCreatePlan } from '@codebuff/agent-runtime/tools/handlers/tool/create-plan'
import { handleEndTurn } from '@codebuff/agent-runtime/tools/handlers/tool/end-turn'
import { handleFindFiles } from '@codebuff/agent-runtime/tools/handlers/tool/find-files'
import { handleGlob } from '@codebuff/agent-runtime/tools/handlers/tool/glob'
import { handleListDirectory } from '@codebuff/agent-runtime/tools/handlers/tool/list-directory'
import { handleLookupAgentInfo } from '@codebuff/agent-runtime/tools/handlers/tool/lookup-agent-info'
import { handleReadDocs } from '@codebuff/agent-runtime/tools/handlers/tool/read-docs'
import { handleReadFiles } from '@codebuff/agent-runtime/tools/handlers/tool/read-files'
import { handleRunFileChangeHooks } from '@codebuff/agent-runtime/tools/handlers/tool/run-file-change-hooks'
import { handleRunTerminalCommand } from '@codebuff/agent-runtime/tools/handlers/tool/run-terminal-command'
import { handleSetMessages } from '@codebuff/agent-runtime/tools/handlers/tool/set-messages'
import { handleSetOutput } from '@codebuff/agent-runtime/tools/handlers/tool/set-output'
import { handleStrReplace } from '@codebuff/agent-runtime/tools/handlers/tool/str-replace'
import { handleThinkDeeply } from '@codebuff/agent-runtime/tools/handlers/tool/think-deeply'
import { handleUpdateSubgoal } from '@codebuff/agent-runtime/tools/handlers/tool/update-subgoal'
import { handleWebSearch } from '@codebuff/agent-runtime/tools/handlers/tool/web-search'
import { handleWriteFile } from '@codebuff/agent-runtime/tools/handlers/tool/write-file'

import { handleSpawnAgentInline } from './tool/spawn-agent-inline'
import { handleSpawnAgents } from './tool/spawn-agents'

import type { CodebuffToolHandlerFunction } from '@codebuff/agent-runtime/tools/handlers/handler-function-type'
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
  run_file_change_hooks: handleRunFileChangeHooks,
  run_terminal_command: handleRunTerminalCommand,
  set_messages: handleSetMessages,
  set_output: handleSetOutput,
  spawn_agents: handleSpawnAgents,
  spawn_agent_inline: handleSpawnAgentInline,
  str_replace: handleStrReplace,
  think_deeply: handleThinkDeeply,
  update_subgoal: handleUpdateSubgoal,
  web_search: handleWebSearch,
  write_file: handleWriteFile,
} satisfies {
  [K in ToolName]: CodebuffToolHandlerFunction<K>
}
