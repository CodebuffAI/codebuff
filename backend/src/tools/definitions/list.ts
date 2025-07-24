import type { ToolName } from '@codebuff/common/constants/tools'
import type { ToolSet } from 'ai'
import type { CodebuffToolDef } from './tool-def-type'

import { addMessageTool } from './tool/add-message'
import { addSubgoalTool } from './tool/add-subgoal'
import { browserLogsTool } from './tool/browser-logs'
import { codeSearchTool } from './tool/code-search'
import { createPlanTool } from './tool/create-plan'
import { endTurnTool } from './tool/end-turn'
import { findFilesTool } from './tool/find-files'
import { readDocsTool } from './tool/read-docs'
import { readFilesTool } from './tool/read-files'
import { runFileChangeHooksTool } from './tool/run-file-change-hooks'
import { runTerminalCommandTool } from './tool/run-terminal-command'
import { sendAgentMessageTool } from './tool/send-agent-message'
import { setMessagesTool } from './tool/set-messages'
import { setOutputTool } from './tool/set-output'
import { spawnAgentsTool } from './tool/spawn-agents'
import { spawnAgentsAsyncTool } from './tool/spawn-agents-async'
import { strReplaceTool } from './tool/str-replace'
import { thinkDeeplyTool } from './tool/think-deeply'
import { updateSubgoalTool } from './tool/update-subgoal'
import { webSearchTool } from './tool/web-search'
import { writeFileTool } from './tool/write-file'

export const codebuffToolDefs = {
  add_message: addMessageTool,
  add_subgoal: addSubgoalTool,
  browser_logs: browserLogsTool,
  code_search: codeSearchTool,
  create_plan: createPlanTool,
  end_turn: endTurnTool,
  find_files: findFilesTool,
  read_docs: readDocsTool,
  read_files: readFilesTool,
  run_file_change_hooks: runFileChangeHooksTool,
  run_terminal_command: runTerminalCommandTool,
  send_agent_message: sendAgentMessageTool,
  set_messages: setMessagesTool,
  set_output: setOutputTool,
  spawn_agents: spawnAgentsTool,
  spawn_agents_async: spawnAgentsAsyncTool,
  str_replace: strReplaceTool,
  think_deeply: thinkDeeplyTool,
  update_subgoal: updateSubgoalTool,
  web_search: webSearchTool,
  write_file: writeFileTool,
} satisfies {
  [K in ToolName]: {
    toolName: K
  }
} & Record<ToolName, CodebuffToolDef> &
  ToolSet
