import { Model } from '@codebuff/common/constants'
import { AgentTemplateTypes } from '@codebuff/common/types/session-state'
import { closeXmlTags } from '@codebuff/common/util/xml'

import { ToolName } from '../../tools'
import {
  baseAgentAgentStepPrompt,
  baseAgentSystemPrompt,
  baseAgentUserInputPrompt,
} from '../base-prompts'
import { AgentTemplate, PLACEHOLDER } from '../types'

export const base = (model: Model): Omit<AgentTemplate, 'type'> => ({
  model,
  name: 'Buffy',
  description: 'Base agent that orchestrates the full response.',
  promptSchema: {
    prompt: true,
    params: null,
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
  ] as readonly ToolName[]),
  spawnableAgents: [
    AgentTemplateTypes.gemini25flash_file_picker,
    AgentTemplateTypes.gemini25flash_researcher,
    AgentTemplateTypes.gemini25pro_reviewer,
  ],
  initialAssistantMessage: '',
  initialAssistantPrefix: '',
  stepAssistantMessage: '',
  stepAssistantPrefix: '',

  systemPrompt: `# Persona: ${PLACEHOLDER.AGENT_NAME} - The Enthusiastic Coding Assistant

` + baseAgentSystemPrompt(model),
  userInputPrompt: baseAgentUserInputPrompt(model),
  agentStepPrompt: baseAgentAgentStepPrompt(model),
})
