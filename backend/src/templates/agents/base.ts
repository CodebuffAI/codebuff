import { Model } from '@codebuff/common/constants'
import { AGENT_PERSONAS } from '@codebuff/common/constants/agents'
import { AgentTemplateTypes } from '@codebuff/common/types/session-state'
import { closeXmlTags } from '@codebuff/common/util/xml'
import z from 'zod/v4'

import { ToolName } from '@codebuff/common/constants/tools'
import {
  baseAgentAgentStepPrompt,
  baseAgentSystemPrompt,
  baseAgentUserInputPrompt,
} from '../base-prompts'
import { AgentTemplate, PLACEHOLDER } from '../types'

export const base = (model: Model): Omit<AgentTemplate, 'type'> => ({
  model,
  name: AGENT_PERSONAS['base'].name,
  implementation: 'llm',
  description: AGENT_PERSONAS['base'].description,
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
  ],
  stopSequences: closeXmlTags([
    'read_files',
    'find_files',
    'run_terminal_command',
    'code_search',
    'spawn_agents',
  ] satisfies readonly ToolName[]),
  spawnableAgents: [
    AgentTemplateTypes.file_picker,
    AgentTemplateTypes.researcher,
    AgentTemplateTypes.thinker,
    AgentTemplateTypes.reviewer,
  ],
  initialAssistantMessage: '',
  initialAssistantPrefix: '',
  stepAssistantMessage: '',
  stepAssistantPrefix: '',

  systemPrompt:
    `# Persona: ${PLACEHOLDER.AGENT_NAME} - The Enthusiastic Coding Assistant

` + baseAgentSystemPrompt(model),
  userInputPrompt: baseAgentUserInputPrompt(model),
  agentStepPrompt: baseAgentAgentStepPrompt(model),
})
