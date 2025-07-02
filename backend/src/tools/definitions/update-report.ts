import { getToolCallString } from '@codebuff/common/constants/tools'
import z from 'zod/v4'
import { CodebuffToolDef } from '../constants'

export const updateReportTool = {
  toolName: 'update_report',
  endsAgentStep: false,
  parameters: z
    .object({
      json_update: z
        .record(z.string(), z.any())
        .describe(
          'JSON object with keys and values to overwrite the existing report. This can be any JSON object with keys and values. Note the values are JSON values, so they can be a nested object or array.'
        ),
    })
    .describe(
      `Update the report of the current agent, which is a JSON object that is initially empty.`
    ),
  description: `
You must use this tool as it is the only way to report any findings to the user. Nothing else you write will be shown to the user.

Please update the report with all the information and analysis you want to pass on to the user. If you just want to send a simple message, use an object with the key "message" and value of the message you want to send.
Example:
${getToolCallString('update_report', {
  jsonUpdate: {
    message: 'I found a bug in the code!',
  },
})}
    `.trim(),
} satisfies CodebuffToolDef
