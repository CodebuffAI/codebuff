import type { ToolDescription } from '../tool-def-type'

import { getToolCallString } from '@codebuff/common/tools/utils'

const toolName = 'spawn_agents_async'
export const spawnAgentsAsyncTool = {
  toolName,
  description: `
Use this tool to spawn subagents asynchronously to help you complete the user request. Unlike spawn_agents, this tool does not wait for the agents to complete and allows the parent agent to continue execution. The subagents can continue to run even if the parent agent ends its turn.

The spawned agents run independently and can communicate back to the parent using send_agent_message. The parent agent can also send further messages to the async agents. The parent agent can end its turn without waiting for the async agents to complete. If so, async children will wake the parent when they send a message.

Prefer to use spawn_agents unless you really need this ability to spawn asynchronous agents.

Example:
${getToolCallString(toolName, {
  agents: JSON.stringify([
    {
      agent_type: 'file_picker',
      prompt: 'Find files related to authentication',
    },
    {
      agent_type: 'researcher',
      prompt: 'Research best practices for user authentication',
      params: { keywords: ['authentication', 'nextjs', 'auth0'] },
    },
  ]),
})}
    `.trim(),
} satisfies ToolDescription
