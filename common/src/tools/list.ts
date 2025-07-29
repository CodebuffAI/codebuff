import type { ToolName, ToolParams } from './constants'

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
import { sendAgentMessageParams } from './params/tool/send-agent-message'
import { setMessagesParams } from './params/tool/set-messages'
import { setOutputParams } from './params/tool/set-output'
import { spawnAgentsParams } from './params/tool/spawn-agents'
import { spawnAgentsAsyncParams } from './params/tool/spawn-agents-async'
import { strReplaceParams } from './params/tool/str-replace'
import { thinkDeeplyParams } from './params/tool/think-deeply'
import { updateSubgoalParams } from './params/tool/update-subgoal'
import { webSearchParams } from './params/tool/web-search'
import { writeFileParams } from './params/tool/write-file'

export const llmToolCallSchema = {
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
  send_agent_message: sendAgentMessageParams,
  set_messages: setMessagesParams,
  set_output: setOutputParams,
  spawn_agents: spawnAgentsParams,
  spawn_agents_async: spawnAgentsAsyncParams,
  str_replace: strReplaceParams,
  think_deeply: thinkDeeplyParams,
  update_subgoal: updateSubgoalParams,
  web_search: webSearchParams,
  write_file: writeFileParams,
} satisfies {
  [K in ToolName]: ToolParams<K>
}

export const clientToolCallSchema = {
  // Tools that require an id and objective
  add_subgoal: ['id', 'objective', 'status', 'plan', 'log'],
  update_subgoal: ['id', 'status', 'plan', 'log'],

  // File operations
  write_file: ['path', 'instructions', 'content'],
  str_replace: ['path', 'replacements'],
  read_files: ['paths'],
  find_files: ['prompt'],

  // Search and terminal
  code_search: ['pattern', 'flags', 'cwd'],
  run_terminal_command: ['command', 'process_type', 'cwd', 'timeout_seconds'],

  // Planning tools
  think_deeply: ['thought'],
  create_plan: ['path', 'plan'],

  browser_logs: ['type', 'url', 'waitUntil'],

  send_agent_message: ['target_agent_id', 'prompt', 'params'],
  spawn_agents: ['agents'],
  spawn_agents_async: ['agents'],
  set_output: [],

  // Documentation tool
  read_docs: ['libraryTitle', 'topic', 'max_tokens'],

  // Web search tool
  web_search: ['query', 'depth'],

  // File change hooks tool
  run_file_change_hooks: ['files'],

  // Tools that change the conversation history
  add_message: ['role', 'content'],
  set_messages: ['messages'],

  end_turn: [],
} as const satisfies Record<ToolName, string[]>
