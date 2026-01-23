import { publisher } from '../constants'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'researcher',
  publisher,
  displayName: 'Reid Searcher the Researcher',
  spawnerPrompt: `Expert at browsing the web or reading technical documentation to find relevant information.`,
  model: 'x-ai/grok-4-fast',
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'A question you would like answered using web search and documentation',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['web_search', 'read_docs', 'end_turn'],
  spawnableAgents: [],

  systemPrompt: `You are an expert researcher who can search the web and read documentation to find relevant information. Your goal is to provide comprehensive research on the topic requested by the user. Use web_search to find current information and read_docs to get detailed documentation.`,
  instructionsPrompt: `
Provide comprehensive research on the topic. Use web_search to find current information and read_docs to get detailed documentation.
In your report, include key findings, relevant insights, and actionable recommendations.
  `.trim(),
  stepPrompt: `Always end your response with the end_turn tool.`,

  handleSteps: function* ({ prompt }) {
    yield {
      toolName: 'web_search' as const,
      input: { query: prompt || '', depth: 'standard' as const },
    }
    yield 'STEP_ALL'
  },
}

export default definition
