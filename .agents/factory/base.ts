import { AGENT_PERSONAS } from '@codebuff/common/constants/agents'

import {
  baseAgentAgentStepPrompt,
  baseAgentSystemPrompt,
  baseAgentUserInputPrompt,
} from '../prompts'
import { AgentTemplateTypes } from '../types/secret-agent-definition'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'
import type { ModelName } from 'types/agent-definition'

export const base = (model: ModelName): Omit<SecretAgentDefinition, 'id'> => ({
  model,
  displayName: AGENT_PERSONAS.base.displayName,
  spawnerPrompt: AGENT_PERSONAS.base.purpose,
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'A coding task to complete',
    },
    params: {
      type: 'object',
      properties: {
        maxContextLength: {
          type: 'number',
        },
      },
      required: [],
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: [
    'add_subgoal',
    'analyze_test_requirements',
    'browser_logs',
    'code_search',
    'create_plan',
    'create_task_checklist',
    'end_turn',
    'read_files',
    'run_terminal_command',
    'smart_find_files',
    'spawn_agents',
    'spawn_agent_inline',
    'str_replace',
    'think_deeply',
    'update_subgoal',
    'write_file',
  ],
  spawnableAgents: [
    AgentTemplateTypes.file_explorer,
    AgentTemplateTypes.file_picker,
    AgentTemplateTypes.researcher,
    AgentTemplateTypes.thinker,
    AgentTemplateTypes.reviewer,
    'context-pruner',
  ],

  systemPrompt: baseAgentSystemPrompt(model),
  instructionsPrompt: baseAgentUserInputPrompt(model),
  stepPrompt: baseAgentAgentStepPrompt(model),

  handleSteps: function* ({ params }) {
    while (true) {
      // Run context-pruner before each step
      yield {
        toolName: 'spawn_agent_inline',
        input: {
          agent_type: 'context-pruner',
          params: params ?? {},
        },
        includeToolCall: false,
      } as any

      const { stepsComplete } = yield 'STEP'
      if (stepsComplete) break
    }
  },
})
