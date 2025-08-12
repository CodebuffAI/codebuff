import { AGENT_PERSONAS } from '@codebuff/common/constants/agents'
import z from 'zod/v4'

import { PLACEHOLDER } from '../types'

import type { AgentTemplate } from '../types'
import type { Model } from '@codebuff/common/constants'
import type { ToolCall } from '@codebuff/common/templates/initial-agents-dir/types/agent-definition'

export const filePicker = (model: Model): Omit<AgentTemplate, 'id'> => ({
  model,
  displayName: AGENT_PERSONAS.file_picker.displayName,
  spawnerPrompt: AGENT_PERSONAS.file_picker.purpose,
  inputSchema: {
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
Provide the locations in the codebase that could be helpful. Focus on the files that are most relevant to the user prompt.
In your report, please give an extremely concise analysis that includes the full paths of files that are relevant and (very briefly) how they could be useful.
  `.trim(),
  stepPrompt: `Do not use the find_files tool or any tools again. Just give your response.`,

  handleSteps: function* ({ agentState, prompt, params }) {
    yield {
      toolName: 'find_files',
      input: { prompt: prompt ?? '' },
    } satisfies ToolCall
    yield 'STEP_ALL'
  },
})
