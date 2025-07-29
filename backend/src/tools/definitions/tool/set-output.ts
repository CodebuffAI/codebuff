import type { ToolDescription } from '../tool-def-type'

import { getToolCallString } from '@codebuff/common/tools/utils'

const toolName = 'set_output'
export const setOutputTool = {
  toolName,
  description: `
You must use this tool as it is the only way to report any findings to the user. Nothing else you write will be shown to the user.

Please set the output with all the information and analysis you want to pass on to the user. If you just want to send a simple message, use an object with the key "message" and value of the message you want to send.
Example:
${getToolCallString(toolName, {
  message: 'I found a bug in the code!',
})}
    `.trim(),
} satisfies ToolDescription
