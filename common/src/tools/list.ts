import z from 'zod/v4'

import { FileChangeSchema } from '../actions'
import { addMessageParams } from './params/tool/add-message'
import { addSubgoalParams } from './params/tool/add-subgoal'
import { browserLogsParams } from './params/tool/browser-logs'
import { codeSearchParams } from './params/tool/code-search'
import { createPlanParams } from './params/tool/create-plan'
import { endTurnParams } from './params/tool/end-turn'
import { findFilesParams } from './params/tool/find-files'
import { globParams } from './params/tool/glob'
import { listDirectoryParams } from './params/tool/list-directory'
import { lookupAgentInfoParams } from './params/tool/lookup-agent-info'
import { readDocsParams } from './params/tool/read-docs'
import { readFilesParams } from './params/tool/read-files'
import { readSubtreeParams } from './params/tool/read-subtree'
import { runFileChangeHooksParams } from './params/tool/run-file-change-hooks'
import { runTerminalCommandParams } from './params/tool/run-terminal-command'
import { setMessagesParams } from './params/tool/set-messages'
import { setOutputParams } from './params/tool/set-output'
import { spawnAgentInlineParams } from './params/tool/spawn-agent-inline'
import { spawnAgentsParams } from './params/tool/spawn-agents'
import { strReplaceParams } from './params/tool/str-replace'
import { taskCompletedParams } from './params/tool/task-completed'
import { thinkDeeplyParams } from './params/tool/think-deeply'
import { updateSubgoalParams } from './params/tool/update-subgoal'
import { webSearchParams } from './params/tool/web-search'
import { writeFileParams } from './params/tool/write-file'
import { writeTodosParams } from './params/tool/write-todos'

import type {
  $ToolParams,
  $ToolResults,
  PublishedToolName,
  ToolName,
} from './constants'
import type { ToolMessage } from '../types/messages/codebuff-message'
import type {
  ToolCallPart,
  ToolResultPart,
} from '../types/messages/content-part'

export const $toolParams = {
  add_message: addMessageParams,
  add_subgoal: addSubgoalParams,
  browser_logs: browserLogsParams,
  code_search: codeSearchParams,
  create_plan: createPlanParams,
  end_turn: endTurnParams,
  find_files: findFilesParams,
  glob: globParams,
  list_directory: listDirectoryParams,
  lookup_agent_info: lookupAgentInfoParams,
  read_docs: readDocsParams,
  read_files: readFilesParams,
  read_subtree: readSubtreeParams,
  run_file_change_hooks: runFileChangeHooksParams,
  run_terminal_command: runTerminalCommandParams,
  set_messages: setMessagesParams,
  set_output: setOutputParams,
  spawn_agents: spawnAgentsParams,
  spawn_agent_inline: spawnAgentInlineParams,
  str_replace: strReplaceParams,
  task_completed: taskCompletedParams,
  think_deeply: thinkDeeplyParams,
  update_subgoal: updateSubgoalParams,
  web_search: webSearchParams,
  write_file: writeFileParams,
  write_todos: writeTodosParams,
} satisfies {
  [K in ToolName]: $ToolParams<K>
}

export const additionalToolResultSchemas = {
  // None for now!
} satisfies Record<string, $ToolResults>
type ResultOnlyToolName = keyof typeof additionalToolResultSchemas

// Tool call from LLM
export type CodebuffToolCall<T extends ToolName = ToolName> = {
  [K in ToolName]: {
    toolName: K
    input: z.infer<(typeof $toolParams)[K]['parameters']>
  } & Omit<ToolCallPart, 'type'>
}[T]

export type CodebuffToolOutput<
  T extends ToolName | ResultOnlyToolName = ToolName,
> = {
  [K in ToolName | ResultOnlyToolName]: K extends ToolName
    ? z.infer<(typeof $toolParams)[K]['outputs']>
    : K extends ResultOnlyToolName
      ? z.infer<(typeof additionalToolResultSchemas)[K]['outputs']>
      : never
}[T]
export type CodebuffToolResult<
  T extends ToolName | ResultOnlyToolName = ToolName,
> = {
  [K in ToolName | ResultOnlyToolName]: {
    toolName: K
    output: CodebuffToolOutput<K>
  } & Omit<ToolResultPart, 'type'>
}[T]

export type CodebuffToolMessage<
  T extends ToolName | ResultOnlyToolName = ToolName,
> = ToolMessage & { content: CodebuffToolResult<T> }

// Tool call to send to client
export type ClientToolName = (typeof clientToolNames)[number]
export const clientToolCallSchema = z.discriminatedUnion('toolName', [
  z.object({
    toolName: z.literal('browser_logs'),
    input: $toolParams.browser_logs.parameters,
  }),
  z.object({
    toolName: z.literal('code_search'),
    input: $toolParams.code_search.parameters,
  }),
  z.object({
    toolName: z.literal('create_plan'),
    input: FileChangeSchema,
  }),
  z.object({
    toolName: z.literal('glob'),
    input: $toolParams.glob.parameters,
  }),
  z.object({
    toolName: z.literal('list_directory'),
    input: $toolParams.list_directory.parameters,
  }),
  z.object({
    toolName: z.literal('run_file_change_hooks'),
    input: $toolParams.run_file_change_hooks.parameters,
  }),
  z.object({
    toolName: z.literal('run_terminal_command'),
    input: $toolParams.run_terminal_command.parameters.and(
      z.object({ mode: z.enum(['assistant', 'user']) }),
    ),
  }),
  z.object({
    toolName: z.literal('str_replace'),
    input: FileChangeSchema,
  }),
  z.object({
    toolName: z.literal('write_file'),
    input: FileChangeSchema,
  }),
])
export const clientToolNames = clientToolCallSchema.def.options.map(
  (opt) => opt.shape.toolName.value,
) satisfies ToolName[]

export type ClientToolCall<T extends ClientToolName = ClientToolName> = z.infer<
  typeof clientToolCallSchema
> & { toolName: T } & Omit<ToolCallPart, 'type'>

export type PublishedClientToolName = ClientToolName & PublishedToolName
