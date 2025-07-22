import { Model } from '@codebuff/common/constants'
import { AGENT_PERSONAS } from '@codebuff/common/constants/agents'
import { AgentTemplateTypes } from '@codebuff/common/types/session-state'
import z from 'zod/v4'

import {
  baseAgentAgentStepPrompt,
  baseAgentSystemPrompt,
  baseAgentUserInputPrompt,
} from '../base-prompts'
import { AgentTemplate } from '../types'

export const base = (
  model: Model,
  allAvailableAgents?: string[]
): Omit<AgentTemplate, 'id'> => ({
  model,
  name: AGENT_PERSONAS['base'].name,
  purpose: AGENT_PERSONAS['base'].purpose,
  promptSchema: {
    prompt: z.string().describe('A coding task to complete'),
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: [
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
    'update_report',
  ],
  spawnableAgents: allAvailableAgents
    ? (allAvailableAgents as any[])
    : [
        AgentTemplateTypes.file_picker,
        AgentTemplateTypes.researcher,
        AgentTemplateTypes.thinker,
        AgentTemplateTypes.reviewer,
      ],
  initialAssistantMessage: '',
  initialAssistantPrefix: '',
  stepAssistantMessage: '',
  stepAssistantPrefix: '',

  systemPrompt: baseAgentSystemPrompt(model),
  userInputPrompt: baseAgentUserInputPrompt(model),
  agentStepPrompt: baseAgentAgentStepPrompt(model),
})
