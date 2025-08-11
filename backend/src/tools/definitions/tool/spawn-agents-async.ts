import { getToolCallString } from '@codebuff/common/tools/utils'

import type { ToolDescription } from '../tool-def-type'

const toolName = 'spawn_agents_async'
export const spawnAgentsAsyncTool = {
  toolName,
  description: `
Use this tool to spawn agents asynchronously to help you complete the user request. Unlike spawn_agents, this tool does not wait for the agents to complete and allows the parent agent to continue execution. The spawned agents can continue to run even if the parent agent ends its turn.

The spawned agents run independently. The parent agent can end its turn without waiting for the async agents to complete.

Prefer to use spawn_agents unless you really need this ability to spawn asynchronous agents.

Example:
${getToolCallString(toolName, {
  agents: [
    {
      agent_type: 'file-picker',
      prompt: 'Find files related to authentication',
    },
    {
      agent_type: 'researcher',
      prompt: 'Research best practices for user authentication',
      params: { keywords: ['authentication', 'nextjs', 'auth0'] },
    },
  ],
})}
    `.trim(),
} satisfies ToolDescription
