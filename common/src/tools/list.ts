import z from 'zod/v4'

import { CHANGES, FileChangeSchema } from '../actions'
import { addMessageParams } from './params/tool/add-message'
import { addSubgoalParams } from './params/tool/add-subgoal'
import { applyPatchParams } from './params/tool/apply-patch'
import { applySmartPatchParams } from './params/tool/apply-smart-patch'
import { askUserParams } from './params/tool/ask-user'
import { browserLogsParams } from './params/tool/browser-logs'
import { checkJobParams } from './params/tool/check-job'
import { codeSearchParams } from './params/tool/code-search'
import { gitStatusParams } from './params/tool/git-status'
import { killJobParams } from './params/tool/kill-job'
import { readLogsParams } from './params/tool/read-logs'
import { createPlanParams } from './params/tool/create-plan'
import { editTransactionParams } from './params/tool/edit-transaction'
import { endTurnParams } from './params/tool/end-turn'
import { findFilesParams } from './params/tool/find-files'
import { findFilesMatchingContentParams } from './params/tool/find-files-matching-content'
import { globParams } from './params/tool/glob'
import { listDirectoryParams } from './params/tool/list-directory'
import { lookupAgentInfoParams } from './params/tool/lookup-agent-info'
import { proposeEditTransactionParams } from './params/tool/propose-edit-transaction'
import { proposeStrReplaceParams } from './params/tool/propose-str-replace'
import { proposeWriteFileParams } from './params/tool/propose-write-file'
import { queryIndexParams } from './params/tool/query-index'
import { readDocsParams } from './params/tool/read-docs'
import { readFilesParams } from './params/tool/read-files'
import { readImageParams } from './params/tool/read-image'
import { readOutlineParams } from './params/tool/read-outline'
import { readSlicesParams } from './params/tool/read-slices'
import { readProposalWorkspaceParams } from './params/tool/read-proposal-workspace'
import { readSubtreeParams } from './params/tool/read-subtree'
import { replaceRangeParams } from './params/tool/replace-range'
import { rewriteSymbolParams } from './params/tool/rewrite-symbol'
import { renderUIParams } from './params/tool/render-ui'
import { runFileChangeHooksParams } from './params/tool/run-file-change-hooks'
import { runTerminalCommandParams } from './params/tool/run-terminal-command'
import { setMessagesParams } from './params/tool/set-messages'
import { setOutputParams } from './params/tool/set-output'
import { skillParams } from './params/tool/skill'
import { spawnAgentInlineParams } from './params/tool/spawn-agent-inline'
import { spawnAgentsParams } from './params/tool/spawn-agents'
import { strReplaceParams } from './params/tool/str-replace'
import { suggestFollowupsParams } from './params/tool/suggest-followups'
import { taskCompletedParams } from './params/tool/task-completed'
import { thinkDeeplyParams } from './params/tool/think-deeply'
import { updateSubgoalParams } from './params/tool/update-subgoal'
import { webSearchParams } from './params/tool/web-search'
import { writeFileParams } from './params/tool/write-file'
import { writeTodosParams } from './params/tool/write-todos'

import type { $ToolParams, PublishedToolName, ToolName } from './constants'
import type { ToolMessage } from '../types/messages/codebuff-message'
import type { ToolCallPart } from '../types/messages/content-part'

export const toolParams = {
  add_message: addMessageParams,
  add_subgoal: addSubgoalParams,
  apply_patch: applyPatchParams,
  apply_smart_patch: applySmartPatchParams,
  ask_user: askUserParams,
  browser_logs: browserLogsParams,
  check_job: checkJobParams,
  code_search: codeSearchParams,
  git_status: gitStatusParams,
  kill_job: killJobParams,
  read_logs: readLogsParams,
  create_plan: createPlanParams,
  edit_transaction: editTransactionParams,
  end_turn: endTurnParams,
  find_files: findFilesParams,
  find_files_matching_content: findFilesMatchingContentParams,
  glob: globParams,
  list_directory: listDirectoryParams,
  lookup_agent_info: lookupAgentInfoParams,
  propose_edit_transaction: proposeEditTransactionParams,
  propose_str_replace: proposeStrReplaceParams,
  propose_write_file: proposeWriteFileParams,
  query_index: queryIndexParams,
  read_docs: readDocsParams,
  read_files: readFilesParams,
  read_image: readImageParams,
  read_outline: readOutlineParams,
  read_slices: readSlicesParams,
  read_proposal_workspace: readProposalWorkspaceParams,
  read_subtree: readSubtreeParams,
  replace_range: replaceRangeParams,
  rewrite_symbol: rewriteSymbolParams,
  render_ui: renderUIParams,
  run_file_change_hooks: runFileChangeHooksParams,
  run_terminal_command: runTerminalCommandParams,
  set_messages: setMessagesParams,
  set_output: setOutputParams,
  skill: skillParams,
  spawn_agents: spawnAgentsParams,
  spawn_agent_inline: spawnAgentInlineParams,
  str_replace: strReplaceParams,
  suggest_followups: suggestFollowupsParams,
  task_completed: taskCompletedParams,
  think_deeply: thinkDeeplyParams,
  update_subgoal: updateSubgoalParams,
  web_search: webSearchParams,
  write_file: writeFileParams,
  write_todos: writeTodosParams,
} satisfies {
  [K in ToolName]: $ToolParams<K>
}

// Tool call from LLM after parsing
export type CodebuffToolCall<T extends ToolName = ToolName> = {
  [K in ToolName]: {
    toolName: K
    input: z.infer<(typeof toolParams)[K]['inputSchema']>
  } & Omit<ToolCallPart, 'type'>
}[T]

export type CodebuffToolOutput<T extends ToolName = ToolName> = {
  [K in ToolName]: K extends ToolName
    ? z.infer<(typeof toolParams)[K]['outputSchema']>
    : never
}[T]

export type CodebuffToolMessage<T extends ToolName = ToolName> = ToolMessage & {
  content: CodebuffToolOutput<T>
}

// Tool call to send to client
export const clientToolCallSchema = z.discriminatedUnion('toolName', [
  z.object({
    toolName: z.literal('apply_patch'),
    input: toolParams.apply_patch.inputSchema,
  }),
  z.object({
    toolName: z.literal('apply_smart_patch'),
    input: toolParams.apply_smart_patch.inputSchema,
  }),
  z.object({
    toolName: z.literal('ask_user'),
    input: toolParams.ask_user.inputSchema,
  }),
  z.object({
    toolName: z.literal('browser_logs'),
    input: toolParams.browser_logs.inputSchema,
  }),
  z.object({
    toolName: z.literal('check_job'),
    input: toolParams.check_job.inputSchema,
  }),
  z.object({
    toolName: z.literal('code_search'),
    input: toolParams.code_search.inputSchema,
  }),
  z.object({
    toolName: z.literal('find_files_matching_content'),
    input: toolParams.find_files_matching_content.inputSchema,
  }),
  z.object({
    toolName: z.literal('kill_job'),
    input: toolParams.kill_job.inputSchema,
  }),
  z.object({
    toolName: z.literal('read_logs'),
    input: toolParams.read_logs.inputSchema,
  }),
  z.object({
    toolName: z.literal('git_status'),
    input: toolParams.git_status.inputSchema,
  }),
  z.object({
    toolName: z.literal('create_plan'),
    input: FileChangeSchema,
  }),
  z.object({
    toolName: z.literal('edit_transaction'),
    input: CHANGES,
  }),
  z.object({
    toolName: z.literal('glob'),
    input: toolParams.glob.inputSchema,
  }),
  z.object({
    toolName: z.literal('list_directory'),
    input: toolParams.list_directory.inputSchema,
  }),
  z.object({
    toolName: z.literal('replace_range'),
    input: toolParams.replace_range.inputSchema,
  }),
  z.object({
    toolName: z.literal('run_file_change_hooks'),
    input: toolParams.run_file_change_hooks.inputSchema,
  }),
  z.object({
    toolName: z.literal('run_terminal_command'),
    input: toolParams.run_terminal_command.inputSchema.and(
      z.object({ mode: z.enum(['assistant', 'user']) }),
    ),
  }),
  z.object({
    toolName: z.literal('str_replace'),
    input: FileChangeSchema,
  }),
  z.object({
    toolName: z.literal('query_index'),
    input: toolParams.query_index.inputSchema,
  }),
  z.object({
    toolName: z.literal('read_image'),
    input: toolParams.read_image.inputSchema,
  }),
  z.object({
    toolName: z.literal('write_file'),
    input: FileChangeSchema,
  }),
])
export const clientToolNames = clientToolCallSchema.def.options.map(
  (opt) => opt.shape.toolName.value,
) satisfies ToolName[]
export type ClientToolName = (typeof clientToolNames)[number]

export type ClientToolCall<T extends ClientToolName = ClientToolName> = Extract<
  z.infer<typeof clientToolCallSchema>,
  { toolName: T }
> &
  Pick<ToolCallPart, 'toolCallId' | 'toolName' | 'providerOptions'>

export type PublishedClientToolName = ClientToolName & PublishedToolName
