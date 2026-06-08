import { handleAddMessage } from './tool/add-message'
import { handleAddSubgoal } from './tool/add-subgoal'
import { handleApplyPatch } from './tool/apply-patch'
import { handleApplySmartPatch } from './tool/apply-smart-patch'
import { handleAskUser } from './tool/ask-user'
import { handleBrowserLogs } from './tool/browser-logs'
import { handleCodeSearch } from './tool/code-search'
import { handleCreatePlan } from './tool/create-plan'
import { handleEditTransaction } from './tool/edit-transaction'
import { handleEndTurn } from './tool/end-turn'
import { handleFindFiles } from './tool/find-files'
import { handleGlob } from './tool/glob'
import { handleListDirectory } from './tool/list-directory'
import { handleLookupAgentInfo } from './tool/lookup-agent-info'
import { handleProposeEditTransaction } from './tool/propose-edit-transaction'
import { handleProposeStrReplace } from './tool/propose-str-replace'
import { handleProposeWriteFile } from './tool/propose-write-file'
import { handleQueryIndex } from './tool/query-index'
import { handleReadDocs } from './tool/read-docs'
import { handleReadFiles } from './tool/read-files'
import { handleReadOutline } from './tool/read-outline'
import { handleReadSlices } from './tool/read-slices'
import { handleReadProposalWorkspace } from './tool/read-proposal-workspace'
import { handleReadSubtree } from './tool/read-subtree'
import { handleReplaceRange } from './tool/replace-range'
import { handleRewriteSymbol } from './tool/rewrite-symbol'
import { handleRenderUI } from './tool/render-ui'
import { handleRunFileChangeHooks } from './tool/run-file-change-hooks'
import { handleRunTerminalCommand } from './tool/run-terminal-command'
import { handleSetMessages } from './tool/set-messages'
import { handleSetOutput } from './tool/set-output'
import { handleSkill } from './tool/skill'
import { handleSpawnAgentInline } from './tool/spawn-agent-inline'
import { handleSpawnAgents } from './tool/spawn-agents'
import { handleStrReplace } from './tool/str-replace'
import { handleSuggestFollowups } from './tool/suggest-followups'
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
  apply_patch: handleApplyPatch,
  apply_smart_patch: handleApplySmartPatch,
  ask_user: handleAskUser,
  browser_logs: handleBrowserLogs,
  code_search: handleCodeSearch,
  create_plan: handleCreatePlan,
  edit_transaction: handleEditTransaction,
  end_turn: handleEndTurn,
  find_files: handleFindFiles,
  glob: handleGlob,
  list_directory: handleListDirectory,
  lookup_agent_info: handleLookupAgentInfo,
  propose_edit_transaction: handleProposeEditTransaction,
  propose_str_replace: handleProposeStrReplace,
  propose_write_file: handleProposeWriteFile,
  query_index: handleQueryIndex,
  read_docs: handleReadDocs,
  read_files: handleReadFiles,
  read_outline: handleReadOutline,
  read_slices: handleReadSlices,
  read_proposal_workspace: handleReadProposalWorkspace,
  read_subtree: handleReadSubtree,
  replace_range: handleReplaceRange,
  rewrite_symbol: handleRewriteSymbol,
  render_ui: handleRenderUI,
  run_file_change_hooks: handleRunFileChangeHooks,
  run_terminal_command: handleRunTerminalCommand,
  set_messages: handleSetMessages,
  set_output: handleSetOutput,
  skill: handleSkill,
  spawn_agents: handleSpawnAgents,
  spawn_agent_inline: handleSpawnAgentInline,
  str_replace: handleStrReplace,
  suggest_followups: handleSuggestFollowups,
  task_completed: handleTaskCompleted,
  think_deeply: handleThinkDeeply,
  update_subgoal: handleUpdateSubgoal,
  web_search: handleWebSearch,
  write_file: handleWriteFile,
  write_todos: handleWriteTodos,
} satisfies {
  [K in ToolName]: CodebuffToolHandlerFunction<K>
}
