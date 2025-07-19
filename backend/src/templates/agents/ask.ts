import { Model } from '@codebuff/common/constants'
import { AGENT_PERSONAS } from '@codebuff/common/constants/agents'
import { AgentTemplateTypes } from '@codebuff/common/types/session-state'
import z from 'zod/v4'
import {
  askAgentAgentStepPrompt,
  askAgentSystemPrompt,
  askAgentUserInputPrompt,
} from '../ask-prompts'
import { AgentTemplate, PLACEHOLDER } from '../types'

export const ask = (model: Model): Omit<AgentTemplate, 'id'> => ({
  model,
  name: AGENT_PERSONAS['ask'].name,
  implementation: 'llm',
  purpose: 'Base ask-mode agent that orchestrates the full response.',
  promptSchema: {
    prompt: z
      .string()
      .describe('A question you would like answered about this project.'),
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
  initialAssistantMessage: '',
  initialAssistantPrefix: '',
  stepAssistantMessage: '',
  stepAssistantPrefix: '',

  systemPrompt:
    `# Persona: ${PLACEHOLDER.AGENT_NAME}

` + askAgentSystemPrompt(model),
  userInputPrompt: askAgentUserInputPrompt(model),
  agentStepPrompt: askAgentAgentStepPrompt(model),
})
