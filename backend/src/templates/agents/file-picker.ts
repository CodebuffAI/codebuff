import { Model } from '@codebuff/common/constants'
import { AGENT_PERSONAS } from '@codebuff/common/constants/agents'
import z from 'zod/v4'

import { AgentTemplate, PLACEHOLDER } from '../types'

export const filePicker = (model: Model): Omit<AgentTemplate, 'id'> => ({
  model,
  displayName: AGENT_PERSONAS['file_picker'].displayName,
  parentPrompt: AGENT_PERSONAS['file_picker'].purpose,
  promptSchema: {
    prompt: z.string().describe('A coding task to complete'),
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['find_files'],
  spawnableAgents: [],

  systemPrompt:
    `# Persona: ${PLACEHOLDER.AGENT_NAME}

You are an expert at finding relevant files in a codebase.
\n\n` +
    [
      PLACEHOLDER.TOOLS_PROMPT,
      PLACEHOLDER.AGENTS_PROMPT,
      PLACEHOLDER.FILE_TREE_PROMPT,
      PLACEHOLDER.SYSTEM_INFO_PROMPT,
      PLACEHOLDER.GIT_CHANGES_PROMPT,
    ].join('\n\n'),
  instructionsPrompt: `
Provide a short analysis of the locations in the codebase that could be helpful. Focus on the files that are most relevant to the user prompt.
In your report, please give an analysis that includes the full paths of files that are relevant and (very briefly) how they could be useful.
  `.trim(),
  stepPrompt: `Do not use the find_files tool or any tools again. Just give your response.`,

  handleSteps: function* ({ agentState, prompt, params }) {
    yield {
      toolName: 'find_files',
      args: { prompt },
    }
    yield 'STEP_ALL'
  },
})
