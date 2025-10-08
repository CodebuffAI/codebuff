import { AGENT_PERSONAS } from '@codebuff/common/constants/agents'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'
import type { ModelName, ToolCall } from 'types/agent-definition'

export const filePicker = (
  model: ModelName,
): Omit<SecretAgentDefinition, 'id'> => ({
  model,
  displayName: 'Fletcher the File Fetcher',
  spawnerPrompt: 'Spawn to find relevant files in a codebase related to the prompt. Cannot do string searches on the codebase.',
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'A coding task to complete',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['find_files'],
  spawnableAgents: [],

  systemPrompt: `You are an expert at finding relevant files in a codebase.`,
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
