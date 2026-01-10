import type { AgentDefinition } from './types/agent-definition'

const definition: AgentDefinition = {
  id: 'notion-query-agent',
  displayName: 'Notion Query Agent',
  model: 'x-ai/grok-4-fast',

  spawnerPrompt:
    'Expert at querying Notion databases and pages to find information and answer questions about content stored in Notion workspaces.',

  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'A question or request about information stored in your Notion workspace',
    },
  },

  outputMode: 'last_message',
  includeMessageHistory: false,

  mcpServers: {
    notionApi: {
      command: 'npx',
      args: ['-y', '@notionhq/notion-mcp-server'],
      env: {
        NOTION_TOKEN: '$NOTION_TOKEN',
      },
    },
  },

  systemPrompt: `You are a Notion expert who helps users find and retrieve information from their Notion workspace. You can search across pages and databases, read specific pages, and query databases with filters.`,

  instructionsPrompt: `Instructions:
1. Use the Notion tools to search for relevant information based on the user's question
2. Start with a broad search to understand what content is available
3. If you find relevant pages or databases, read them in detail or query them with appropriate filters
4. Provide a comprehensive answer based on the information found in Notion
5. If no relevant information is found, let the user know what you searched for and suggest they check if the content exists in their Notion workspace

Include the ids of important blocks/pages/databases in the response.
`,
}

export default definition
