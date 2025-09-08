import type { SecretAgentDefinition } from '../types/secret-agent-definition'
import type { Model } from '@codebuff/common/old-constants'

export const webResearcher = (
  model: Model,
): Omit<SecretAgentDefinition, 'id'> => ({
  model,
  displayName: 'Weeb',
  spawnerPrompt: `Expert at browsing the web to find relevant information.`,
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'A question you would like answered using web search',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['web_search', 'end_turn'],
  spawnableAgents: [],

  systemPrompt: `You are an expert researcher who can search the web to find relevant information. Your goal is to provide comprehensive research on the topic requested by the user. Use web_search to find current information.`,
  instructionsPrompt:
    `Provide comprehensive research on the topic. Use web_search to find current information.
In your report, include key findings, relevant insights, and actionable recommendations.
Always end your response with the end_turn tool.`.trim(),

  handleSteps: function* ({ agentState, prompt, params }) {
    yield {
      toolName: 'web_search' as const,
      input: { query: prompt || '', depth: 'standard' as const },
    }
    yield 'STEP_ALL'
  },
})
