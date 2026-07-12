import { publisher } from './constants'

import type { AgentDefinition } from './types/agent-definition'

const definition: AgentDefinition = {
  id: 'notion-researcher',
  publisher,
  displayName: 'Notion Researcher',

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
  toolNames: [
    'spawn_agents',
    'notionApi/notion-search',
    'notionApi/notion-fetch',
  ],
  spawnableAgents: ['notion-query-agent'],

  mcpServers: {
    notionApi: {
      command: 'npx',
      args: ['-y', '@notionhq/notion-mcp-server@2.4.1'],
      env: {
        NOTION_TOKEN: '$NOTION_TOKEN',
      },
    },
  },

  systemPrompt: `You are an expert research coordinator who specializes in conducting comprehensive investigations across Notion workspaces. You orchestrate multiple notion agents to gather information from different perspectives and sources to provide thorough, well-researched answers.`,

  instructionsPrompt: `Instructions:
- Use at most two waves of notion agents, with at most four agents total. Give each agent a distinct question or source target.
- Preserve stable page/database/block IDs from child results alongside every factual claim so later follow-up can retrieve the same source.
- Stop spawning once each major sub-question has at least one relevant source; use the second wave only for unresolved gaps or contradiction checks.
- Write a comprehensive report with a compact Sources section mapping stable Notion IDs to the claims they support.
`,
}

export default definition
