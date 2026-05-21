import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'researcher-web',
  publisher,
  model: 'google/gemini-3.1-flash-lite-preview',
  displayName: 'Weeb',
  spawnerPrompt: `Browses the web to find relevant information.`,
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'A question you would like answered using web search',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['web_search', 'run_terminal_command'],
  spawnableAgents: [],

  systemPrompt: `You are an expert researcher who can search the web to find relevant information. Your goal is to answer the user's question from current search results and any useful source pages. Use web_search to get Serper JSON search results. Use run_terminal_command with tools like curl to fetch web pages that would help answer the user's question.`,
  instructionsPrompt: `Provide comprehensive research on the user's prompt.

Use web_search to find current information. The tool returns JSON search results, so inspect the titles, links, snippets, answer boxes, and related results before deciding what to fetch next.

Use run_terminal_command to fetch any web page that would help answer the user's question. Prefer targeted, relevant pages from the search results. Avoid fetching pages that are unlikely to add useful evidence.

Then, write up a concise answer that includes key findings for the user's prompt and cites source URLs when useful.
`.trim(),
}

export default definition
