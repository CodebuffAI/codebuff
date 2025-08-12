import { getToolCallString } from '@codebuff/common/tools/utils'

import type { ToolDescription } from '../tool-def-type'

const toolName = 'spawn_agents'
export const spawnAgentsTool = {
  toolName,
  description: `
Use this tool to spawn agents to help you complete the user request. Each agent has specific requirements for prompt and params based on their inputSchema.

The prompt field is a simple string, while params is a JSON object that gets validated against the agent's schema.

Example:
${getToolCallString(toolName, {
  agents: [
    {
      agent_type: 'planner',
      prompt: 'Create a plan for implementing user authentication',
      params: { filePaths: ['src/auth.ts', 'src/user.ts'] },
    },
  ],
})}
    `.trim(),
} satisfies ToolDescription
