import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'researcher-web',
  publisher,
  model: 'google/gemini-3.1-flash-lite-preview',
  displayName: 'Web Researcher',
  spawnerPrompt: `Browses the web to find relevant information.`,
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'A question you would like answered using web search',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['web_search', 'read_url'],
  spawnableAgents: [],

  systemPrompt: `You are an expert researcher who can search the web to find relevant information. Your goal is to answer the user's question from current search results and useful source pages. Use web_search to get Serper JSON search results. Use read_url to fetch and extract readable text from pages that would help answer the user's question.`,
  instructionsPrompt: `Provide comprehensive research on the user's prompt.

Use web_search to find current information. The tool returns JSON search results, so inspect the titles, links, snippets, answer boxes, and related results before deciding what to fetch next.

Use read_url to fetch any web page that would help answer the user's question. Prefer targeted, relevant pages from the search results, especially official or primary sources. Avoid fetching pages that are unlikely to add useful evidence.

If read_url cannot handle a source, choose a different result or explain the limitation.

Then, write up a concise answer that includes key findings for the user's prompt and cites source URLs when useful.
`.trim(),
}

export default definition
