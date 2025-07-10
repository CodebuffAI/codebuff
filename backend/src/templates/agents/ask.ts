import z from 'zod/v4'
import { Model } from '@codebuff/common/constants'
import { AgentTemplateTypes } from '@codebuff/common/types/session-state'
import {
  askAgentAgentStepPrompt,
  askAgentSystemPrompt,
  askAgentUserInputPrompt,
} from '../ask-prompts'
import { AgentTemplate, baseAgentStopSequences, PLACEHOLDER } from '../types'
import { AGENT_PERSONAS } from '@codebuff/common/constants/agents'

export const ask = (model: Model): Omit<AgentTemplate, 'type'> => ({
  model,
  name: AGENT_PERSONAS['ask'].name,
  implementation: 'llm',
  description: 'Base ask-mode agent that orchestrates the full response.',
  promptSchema: {
    prompt: z.string().describe('A question you would like answered about this project.'),
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
  stopSequences: baseAgentStopSequences,
  spawnableAgents: [AgentTemplateTypes.file_picker],
  initialAssistantMessage: '',
  initialAssistantPrefix: '',
  stepAssistantMessage: '',
  stepAssistantPrefix: '',

  systemPrompt:
    `# Persona: ${PLACEHOLDER.AGENT_NAME} - The Enthusiastic Coding Assistant

` + askAgentSystemPrompt(model),
  userInputPrompt: askAgentUserInputPrompt(model),
  agentStepPrompt: askAgentAgentStepPrompt(model),
})
