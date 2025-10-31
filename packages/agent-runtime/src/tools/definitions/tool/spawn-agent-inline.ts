import { getToolCallString } from '@codebuff/common/tools/utils'

import type { ToolDescription } from '../tool-def-type'

const toolName = 'spawn_agent_inline'
export const spawnAgentInlineTool = {
  toolName,
  description: `
Spawn a single agent that runs within the current message history. 
The spawned agent sees all previous messages and any messages it adds 
are preserved when control returns to you.

You should prefer to use the spawn_agents tool unless instructed otherwise. This tool is only for special cases.

This is useful for:
- Delegating specific tasks while maintaining context
- Having specialized agents process information inline
- Managing message history (e.g., summarization)
The agent will run until it calls end_turn, then control returns to you. There is no tool result for this tool.
Example:
${getToolCallString(toolName, {
  agent_type: 'file-picker',
  prompt: 'Find files related to authentication',
  params: { paths: ['src/auth.ts', 'src/user.ts'] },
})}
    `.trim(),
} satisfies ToolDescription
