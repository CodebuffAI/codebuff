import { getToolCallString } from '@codebuff/common/tools/utils'

import type { ToolDescription } from '../tool-def-type'

const toolName = 'end_turn'
export const endTurnTool = {
  toolName,
  description: `
Only use this tool to hand control back to the user.

- When to use: after you have completed a meaningful chunk of work and you are either (a) fully done, or (b) explicitly waiting for the user's next message.
- Do NOT use: as a stop token mid-work, to pause between tool calls, to wait for tool results, or to "check in" unnecessarily.
- Before calling: finish all pending steps, resolve tool results, and include any outputs the user needs to review.
- Effect: Signals the UI to wait for the user's reply; any pending tool results will be ignored.

*INCORRECT USAGE*:
${getToolCallString('some_tool_that_produces_results', { query: 'some example search term' })}

${getToolCallString(toolName, {})}

*CORRECT USAGE*:
All done! Would you like some more help with xyz?

${getToolCallString(toolName, {})}

    `.trim(),
} satisfies ToolDescription
