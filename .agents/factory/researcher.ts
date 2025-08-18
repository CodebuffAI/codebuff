import { AGENT_PERSONAS } from '@codebuff/common/constants/agents'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'
import type { Model } from '@codebuff/common/constants'

export const researcher = (
  model: Model,
): Omit<SecretAgentDefinition, 'id'> => ({
  model,
  displayName: AGENT_PERSONAS.researcher.displayName,
  spawnerPrompt: AGENT_PERSONAS.researcher.purpose,
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'A question you would like answered using web search and documentation',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['web_search', 'read_docs', 'read_files', 'end_turn'],
  spawnableAgents: [],

  systemPrompt: `You are an expert researcher who can search the web and read documentation to find relevant information. Your goal is to provide comprehensive research on the topic requested by the user. Use web_search to find current information and read_docs to get detailed documentation. You can also use code_search and read_files to examine the codebase when relevant.`,
  instructionsPrompt: `
Provide comprehensive research on the topic. Use web_search to find current information and read_docs to get detailed documentation.
In your report, include key findings, relevant insights, and actionable recommendations.
  `.trim(),
  stepPrompt: `Always end your response with the end_turn tool.`,

  handleSteps: function* ({ agentState, prompt, params }) {
    yield {
      toolName: 'web_search' as const,
      input: { query: prompt || '', depth: 'standard' as const },
    }
    yield 'STEP_ALL'
  },
})
