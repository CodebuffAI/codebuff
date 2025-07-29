import type { ToolDescription } from '../tool-def-type'

import { getToolCallString } from '@codebuff/common/tools/utils'

const toolName = 'update_subgoal'
export const updateSubgoalTool = {
  toolName,
  description: `
Examples:

Usage 1 (update status):
${getToolCallString(toolName, {
  id: '1',
  status: 'COMPLETE',
})}

Usage 2 (update plan):
${getToolCallString(toolName, {
  id: '3',
  plan: 'Create file for endpoint in the api. Register it in the router.',
})}

Usage 3 (add log):
${getToolCallString(toolName, {
  id: '1',
  log: 'Found the error in the tests. Culprit: foo function.',
})}

Usage 4 (update status and add log):
${getToolCallString(toolName, {
  id: '1',
  status: 'COMPLETE',
  log: 'Reran the tests (passed)',
})}
    `.trim(),
} satisfies ToolDescription
