import { handleAddMessage } from './tool/add-message'
import { handleAddSubgoal } from './tool/add-subgoal'
import { handleApplyPatch } from './tool/apply-patch'
import { handleApplySmartPatch } from './tool/apply-smart-patch'
import { handleAskUser } from './tool/ask-user'
import { handleBrowserLogs } from './tool/browser-logs'
import { handleCheckBackgroundAgent } from './tool/check-background-agent'
import { handleCheckJob } from './tool/check-job'
import { handleCodeSearch } from './tool/code-search'
import { handleCreatePlan } from './tool/create-plan'
import { handleEditTransaction } from './tool/edit-transaction'
import { handleEndTurn } from './tool/end-turn'
import { handleFindFiles } from './tool/find-files'
import { handleFindFilesMatchingContent } from './tool/find-files-matching-content'
import { handleGitBranch } from './tool/git-branch'
import { handleGitStatus } from './tool/git-status'
import { handleInspectWorkspace } from './tool/inspect-workspace'
import { handleGetTask } from './tool/get-task'
import { handleGetChangeReviewBundle } from './tool/get-change-review-bundle'
import { handleGlob } from './tool/glob'
import { handleKillJob } from './tool/kill-job'
import { handleReadLogs } from './tool/read-logs'
import { handleListDirectory } from './tool/list-directory'
import { handleLookupAgentInfo } from './tool/lookup-agent-info'
import { handleQueryIndex } from './tool/query-index'
import { handleReadDocs } from './tool/read-docs'
import { handleReadFiles } from './tool/read-files'
import { handleReadImage } from './tool/read-image'
import { handleReadOutline } from './tool/read-outline'
import { handleReadSlices } from './tool/read-slices'
import { handleReadSubtree } from './tool/read-subtree'
import { handleReplaceRange } from './tool/replace-range'
import { handleRewriteSymbol } from './tool/rewrite-symbol'
import { handleRenderUI } from './tool/render-ui'
import { handleRunFileChangeHooks } from './tool/run-file-change-hooks'
import { handleRunTargetedValidation } from './tool/run-targeted-validation'
import { handleInspectEnvironment } from './tool/inspect-environment'
import { handleGetAffectedTests } from './tool/get-affected-tests'
import { handleGetBuildTargets } from './tool/get-build-targets'
import {
  handleEvaluateAuditCoverage,
  handleInspectCodebaseStructure,
  handleInspectFeatureCompleteness,
} from './tool/audit-intelligence'
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
import { handleUpdatePlanStatus } from './tool/update-plan-status'
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
  check_background_agent: handleCheckBackgroundAgent,
  check_job: handleCheckJob,
  code_search: handleCodeSearch,
  create_plan: handleCreatePlan,
  edit_transaction: handleEditTransaction,
  end_turn: handleEndTurn,
  find_files: handleFindFiles,
  find_files_matching_content: handleFindFilesMatchingContent,
  git_status: handleGitStatus,
  git_branch: handleGitBranch,
  get_task: handleGetTask,
  get_change_review_bundle: handleGetChangeReviewBundle,
  inspect_workspace: handleInspectWorkspace,
  glob: handleGlob,
  kill_job: handleKillJob,
  read_logs: handleReadLogs,
  list_directory: handleListDirectory,
  lookup_agent_info: handleLookupAgentInfo,
  query_index: handleQueryIndex,
  read_docs: handleReadDocs,
  read_files: handleReadFiles,
  read_image: handleReadImage,
  read_outline: handleReadOutline,
  read_slices: handleReadSlices,
  read_subtree: handleReadSubtree,
  replace_range: handleReplaceRange,
  rewrite_symbol: handleRewriteSymbol,
  render_ui: handleRenderUI,
  run_file_change_hooks: handleRunFileChangeHooks,
  run_targeted_validation: handleRunTargetedValidation,
  inspect_environment: handleInspectEnvironment,
  get_affected_tests: handleGetAffectedTests,
  get_build_targets: handleGetBuildTargets,
  inspect_codebase_structure: handleInspectCodebaseStructure,
  inspect_feature_completeness: handleInspectFeatureCompleteness,
  evaluate_audit_coverage: handleEvaluateAuditCoverage,
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
  update_plan_status: handleUpdatePlanStatus,
  update_subgoal: handleUpdateSubgoal,
  web_search: handleWebSearch,
  write_file: handleWriteFile,
  write_todos: handleWriteTodos,
} satisfies {
  [K in ToolName]: CodebuffToolHandlerFunction<K>
}
