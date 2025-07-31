import { getToolCallString } from '@codebuff/common/tools/utils'

import type { ToolDescription } from '../tool-def-type'

const toolName = 'add_subgoal'
export const addSubgoalTool = {
  toolName,
  description: `
Example:
${getToolCallString(toolName, {
  id: '1',
  objective: 'Add a new "deploy api" subgoal',
  status: 'IN_PROGRESS',
})}
`.trim(),
} satisfies ToolDescription
