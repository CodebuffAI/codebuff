import { publisher } from './constants'
import { base } from './factory/base'

import type { SecretAgentDefinition } from './types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'base-quick',
  publisher,
  ...base('openai/gpt-5-chat', 'lite'),
  toolNames: [
    'create_plan',
    'run_terminal_command',
    'str_replace',
    'write_file',
    'spawn_agents',
    'spawn_agent_inline',
    'add_subgoal',
    'browser_logs',
    'code_search',
    'read_files',
    'update_subgoal',
  ],
  spawnableAgents: [
    'file-explorer',
    'web-researcher',
    'docs-researcher',
    'context-pruner',
  ],
}

export default definition
