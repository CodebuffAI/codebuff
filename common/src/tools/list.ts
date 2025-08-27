import z from 'zod/v4'

import { FileChangeSchema } from '../actions'
import { addMessageParams } from './params/tool/add-message'
import { addSubgoalParams } from './params/tool/add-subgoal'
import { browserLogsParams } from './params/tool/browser-logs'
import { codeSearchParams } from './params/tool/code-search'
import { createPlanParams } from './params/tool/create-plan'
import { endTurnParams } from './params/tool/end-turn'
import { findFilesParams } from './params/tool/find-files'
import { readDocsParams } from './params/tool/read-docs'
import { readFilesParams } from './params/tool/read-files'
import { runFileChangeHooksParams } from './params/tool/run-file-change-hooks'
import { runTerminalCommandParams } from './params/tool/run-terminal-command'
import { setMessagesParams } from './params/tool/set-messages'
import { setOutputParams } from './params/tool/set-output'
import { spawnAgentInlineParams } from './params/tool/spawn-agent-inline'
import { spawnAgentsParams } from './params/tool/spawn-agents'
import { spawnAgentsAsyncParams } from './params/tool/spawn-agents-async'
import { strReplaceParams } from './params/tool/str-replace'
import { thinkDeeplyParams } from './params/tool/think-deeply'
import { updateSubgoalParams } from './params/tool/update-subgoal'
import { webSearchParams } from './params/tool/web-search'
import { writeFileParams } from './params/tool/write-file'

import type { ToolName, $ToolParams } from './constants'
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
  read_docs: readDocsParams,
  read_files: readFilesParams,
  run_file_change_hooks: runFileChangeHooksParams,
  run_terminal_command: runTerminalCommandParams,
  set_messages: setMessagesParams,
  set_output: setOutputParams,
  spawn_agents: spawnAgentsParams,
  spawn_agents_async: spawnAgentsAsyncParams,
  spawn_agent_inline: spawnAgentInlineParams,
  str_replace: strReplaceParams,
  think_deeply: thinkDeeplyParams,
  update_subgoal: updateSubgoalParams,
  web_search: webSearchParams,
  write_file: writeFileParams,
} satisfies {
  [K in ToolName]: $ToolParams<K>
}

// Tool call from LLM
export type CodebuffToolCall<T extends ToolName = ToolName> = {
  [K in ToolName]: {
    toolName: K
    input: z.infer<(typeof $toolParams)[K]['parameters']>
  } & Omit<ToolCallPart, 'type'>
}[T]

export type CodebuffToolResult<T extends ToolName = ToolName> = {
  [K in ToolName]: {
    toolName: K
    output: z.infer<(typeof $toolParams)[K]['outputs']>
  } & Omit<ToolResultPart, 'type'>
}[T]

// Tool call to send to client
export type ClientToolName = (typeof clientToolNames)[number]
const clientToolCallSchema = z.discriminatedUnion('toolName', [
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
