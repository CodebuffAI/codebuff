import { Model } from '@codebuff/common/constants'
import { AGENT_PERSONAS } from '@codebuff/common/constants/agents'
import { getToolCallString } from '@codebuff/common/constants/tools'
import { closeXml } from '@codebuff/common/util/xml'
import z from 'zod/v4'

import { AgentTemplate, PLACEHOLDER } from '../types'

export const filePicker = (model: Model): Omit<AgentTemplate, 'id'> => ({
  model,
  name: AGENT_PERSONAS['file_picker'].name,
  purpose: AGENT_PERSONAS['file_picker'].purpose,
  promptSchema: {
    prompt: z.string().describe('A coding task to complete'),
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['find_files', 'end_turn'],
  spawnableAgents: [],

  initialAssistantMessage: getToolCallString(
    'find_files',
    {
      description: PLACEHOLDER.INITIAL_AGENT_PROMPT,
    },
    true
  ),
  initialAssistantPrefix: '',
  stepAssistantMessage: '',
  stepAssistantPrefix: '',

  systemPrompt:
    `# Persona: ${PLACEHOLDER.AGENT_NAME}

You are an expert at finding relevant files in a codebase.
\n\n` +
    [
      PLACEHOLDER.TOOLS_PROMPT,
      PLACEHOLDER.FILE_TREE_PROMPT,
      PLACEHOLDER.SYSTEM_INFO_PROMPT,
      PLACEHOLDER.GIT_CHANGES_PROMPT,
    ].join('\n\n'),
  userInputPrompt: `
Provide a short analysis of the locations in the codebase that could be helpful. Focus on the files that are most relevant to the user prompt.
In your report, please give an analysis that includes the full paths of files that are relevant and (very briefly) how they could be useful. Then use end_turn to end your response.
  `.trim(),
  agentStepPrompt: `Do not use the find_files tool again. Give your response and then end your response with the end_turn tool: <end_turn>${closeXml('end_turn')}`,
})
