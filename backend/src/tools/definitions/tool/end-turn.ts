import type { ToolDescription } from '../tool-def-type'

import { getToolCallString } from '@codebuff/common/tools/utils'

const toolName = 'end_turn'
export const endTurnTool = {
  toolName,
  description: `
Purpose: Use this tool if you have fully responded to the user and want to get their feedback. This ignores any tool results (from write_file, run_terminal_command, etc.), so be sure you are done before using it.

Make sure to use this tool if you want a response from the user and not the system. Otherwise, you may receive tool results from the previous tools. e.g. "Let me know if you need xyz!${getToolCallString(toolName, {})}"

Example:
${getToolCallString(toolName, {})}
    `.trim(),
} satisfies ToolDescription
