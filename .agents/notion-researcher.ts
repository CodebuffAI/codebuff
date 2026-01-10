import type { AgentDefinition } from './types/agent-definition'
import { publisher } from './constants'

const definition: AgentDefinition = {
  id: 'notion-researcher',
  publisher,
  displayName: 'Notion Researcher',
  model: 'x-ai/grok-4-fast',

  spawnerPrompt:
    'Expert at conducting comprehensive research across Notion workspaces by spawning multiple notion agents in parallel waves to gather information from different angles and sources.',

  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'A research question or topic to investigate thoroughly across your Notion workspace',
    },
  },

  outputMode: 'last_message',
  includeMessageHistory: true,
  toolNames: ['spawn_agents'],
  spawnableAgents: ['notion-query-agent'],

  mcpServers: {
    notionApi: {
      command: 'npx',
      args: ['-y', '@notionhq/notion-mcp-server'],
      env: {
        NOTION_TOKEN: '$NOTION_TOKEN',
      },
    },
  },

  systemPrompt: `You are an expert research coordinator who specializes in conducting comprehensive investigations across Notion workspaces. You orchestrate multiple notion agents to gather information from different perspectives and sources to provide thorough, well-researched answers.`,

  instructionsPrompt: `Instructions:
- Spawn notion agents to gather information from different perspectives and sources.
- You can spawn multiple notion agents in parallel to get even more information faster.
- Once you have gathered some information, spawn more notion agents to gather even more information to answer the user's question in the best way possible.
- Write up a comprehensive report of the information gathered from the notion agents. No need to include the ids of the blocks/pages/databases in the report.
`,
}

export default definition
