import type { SecretAgentDefinition } from '../types/secret-agent-definition'
import { publisher } from '../constants'

const definition: SecretAgentDefinition = {
  id: 'researcher-web',
  publisher,
  model: 'x-ai/grok-4-fast',
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
  toolNames: ['web_search'],
  spawnableAgents: [],

  systemPrompt: `You are an expert researcher who can search the web to find relevant information. Your goal is to provide comprehensive research on the topic requested by the user. Use web_search to find current information.`,
  instructionsPrompt: `
Provide comprehensive research on the user's prompt.

Use web_search to find current information. Repeat the web_search tool call until you have gathered all the relevant information.

Then, write up a report that includes key findings, relevant insights, and actionable recommendations for the user's prompt.
`.trim(),

  handleSteps: function* ({ agentState, prompt, params }) {
    yield {
      toolName: 'web_search' as const,
      input: { query: prompt || '', depth: 'standard' as const },
    }
    yield 'STEP_ALL'
  },
}

export default definition
