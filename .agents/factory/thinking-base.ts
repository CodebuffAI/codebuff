import { AGENT_PERSONAS } from '@codebuff/common/constants/agents'
import { AgentTemplateTypes } from '@codebuff/common/types/session-state'

import {
  baseAgentAgentStepPrompt,
  baseAgentSystemPrompt,
  baseAgentUserInputPrompt,
} from '../prompts'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'
import type { Model } from '@codebuff/common/constants'
import type { ToolCall } from '@codebuff/common/templates/initial-agents-dir/types/agent-definition'

const baseAgentToolNames = [
  'create_plan',
  'run_terminal_command',
  'str_replace',
  'write_file',
  'spawn_agents',
  'add_subgoal',
  'browser_logs',
  'code_search',
  'end_turn',
  'read_files',
  'think_deeply',
  'update_subgoal',
] as const

const baseAgentSubagents = [
  AgentTemplateTypes.file_picker,
  AgentTemplateTypes.researcher,
  AgentTemplateTypes.thinker,
  AgentTemplateTypes.reviewer,
]

export const thinkingBase = (
  model: Model,
  allAvailableAgents?: string[],
): Omit<SecretAgentDefinition, 'id'> => ({
  model,
  displayName: AGENT_PERSONAS['base-lite'].displayName,
  spawnerPrompt: AGENT_PERSONAS['base-lite'].purpose,
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'A coding task to complete',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: [...baseAgentToolNames],
  spawnableAgents: allAvailableAgents
    ? (allAvailableAgents as any[])
    : baseAgentSubagents,

  systemPrompt: baseAgentSystemPrompt(model),
  instructionsPrompt: baseAgentUserInputPrompt(model),
  stepPrompt: baseAgentAgentStepPrompt(model),

  handleSteps: function* ({ agentState, prompt, params }) {
    while (true) {
      yield {
        toolName: 'spawn_agents',
        input: {
          agents: [
            {
              agent_type: 'thinker',
              prompt: 'Think deeply about the user request',
            },
          ],
        },
      } satisfies ToolCall
      yield 'STEP'
    }
  },
})
