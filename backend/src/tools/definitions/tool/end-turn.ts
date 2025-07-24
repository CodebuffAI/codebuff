import type { CodebuffToolDef } from '../tool-def-type'

import { getToolCallString } from '@codebuff/common/constants/tools'
import z from 'zod/v4'

const toolName = 'end_turn'
const endsAgentStep = true
export const endTurnTool = {
  toolName,
  endsAgentStep,
  parameters: z
    .object({})
    .describe(
      `End your turn, regardless of any new tool results that might be coming. This will allow the user to type another prompt.`
    ),
  description: `
Purpose: Use this tool if you have fully responded to the user and want to get their feedback. This ignores any tool results (from write_file, run_terminal_command, etc.), so be sure you are done before using it.

Make sure to use this tool if you want a response from the user and not the system. Otherwise, you may receive tool results from the previous tools. e.g. "Let me know if you need xyz!${getToolCallString(toolName, {}, endsAgentStep)}"

Example:
${getToolCallString(toolName, {}, endsAgentStep)}
    `.trim(),
} satisfies CodebuffToolDef
