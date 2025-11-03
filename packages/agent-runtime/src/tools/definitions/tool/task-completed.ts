import { getToolCallString } from '@codebuff/common/tools/utils'

import type { ToolDescription } from '../tool-def-type'

const toolName = 'task_completed'
export const taskCompletedTool = {
  toolName,
  description: `
Use this tool to signal that the task is complete.

- When to use:
  * The user's request is completely fulfilled and you have nothing more to do
  * You need clarification from the user before continuing
  * You need help from the user to continue (e.g., missing information, unclear requirements)
  * You've encountered a blocker that requires user intervention

- Before calling:
  * Ensure all pending work is finished
  * Resolve all tool results
  * Provide any outputs or summaries the user needs

- Effect: Signals completion of the current task and returns control to the user

*EXAMPLE USAGE*:

All changes have been implemented and tested successfully!

${getToolCallString(toolName, {})}

OR

I need more information to proceed. Which database schema should I use for this migration?

${getToolCallString(toolName, {})}

OR

I can't get the tests to pass after several different attempts. I need help from the user to proceed.

${getToolCallString(toolName, {})}

    `.trim(),
} satisfies ToolDescription
