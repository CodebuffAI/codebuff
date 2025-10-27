import { getToolCallString } from '@codebuff/common/tools/utils'

import type { ToolDescription } from '../tool-def-type'

const toolName = 'write_todos'
export const writeTodosTool = {
  toolName,
  description: `
Use this tool to track your objectives through an ordered step-by-step plan. Call this tool after you have gathered context on the user's request to plan out the implementation steps for the user's request.

After completing each todo step, call this tool again to update the list and mark that task as completed. Note that each time you call this tool, rewrite ALL todos with their current status.

Use this tool frequently as you work through tasks to update the list of todos with their current status. Doing this is extremely useful because it helps you stay on track and complete all the requirements of the user's request. It also helps inform the user of your plans and the current progress, which they want to know at all times.

Example:
${getToolCallString(toolName, {
  todos: [
    { task: 'Create new implementation in foo.ts', completed: true },
    { task: 'Update bar.ts to use the new implementation', completed: false },
    { task: 'Write tests for the new implementation', completed: false },
    {
      task: 'Run the tests to verify the new implementation',
      completed: false,
    },
  ],
})}
`.trim(),
} satisfies ToolDescription
