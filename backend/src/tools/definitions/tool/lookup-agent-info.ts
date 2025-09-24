import { getToolCallString } from '@codebuff/common/tools/utils'

import type { ToolDescription } from '../tool-def-type'

const toolName = 'lookup_agent_info'
export const lookupAgentInfoTool = {
  toolName,
  description: `
Retrieve information about an agent by ID for proper spawning. Use this when you see a request with a full agent ID like "@publisher/agent-id@version" to validate the agent exists and get its metadata. Only agents that are published under a publisher and version are supported for this tool. 

Example:
${getToolCallString(toolName, {
  agentId: 'codebuff/researcher@0.0.1',
})}
    `.trim(),
} satisfies ToolDescription
