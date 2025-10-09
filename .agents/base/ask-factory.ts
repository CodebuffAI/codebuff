import { AGENT_PERSONAS } from '@codebuff/common/constants/agents'

import {
  askAgentAgentStepPrompt,
  askAgentSystemPrompt,
  askAgentUserInputPrompt,
} from './ask-prompts'
import {
  AgentTemplateTypes,
  PLACEHOLDER,
} from '../types/secret-agent-definition'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'
import type { Model } from '@codebuff/common/old-constants'

export const ask = (model: Model): Omit<SecretAgentDefinition, 'id'> => ({
  model,
  displayName: AGENT_PERSONAS.ask.displayName,
  spawnerPrompt: 'Base ask-mode agent that orchestrates the full response.',
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'A question you would like answered about this project.',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: [
    'spawn_agents',
    'add_subgoal',
    'update_subgoal',
    'browser_logs',
    'code_search',
    'end_turn',
    'read_files',
    'think_deeply',
  ],
  spawnableAgents: [AgentTemplateTypes.file_picker],

  systemPrompt:
    `# Persona: ${PLACEHOLDER.AGENT_NAME}

` + askAgentSystemPrompt(model),
  instructionsPrompt: askAgentUserInputPrompt(model),
  stepPrompt: askAgentAgentStepPrompt(model),
})
