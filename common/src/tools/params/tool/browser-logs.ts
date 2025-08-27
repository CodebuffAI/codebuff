import z from 'zod/v4'

import { BrowserResponseSchema } from '../../../browser-actions'

import type { $ToolParams } from '../../constants'

const toolName = 'browser_logs'
const endsAgentStep = true
export const browserLogsParams = {
  toolName,
  endsAgentStep,
  parameters: z.object({
    type: z
      .string()
      .min(1, 'Type cannot be empty')
      .describe('The type of browser action to perform (e.g., "navigate").'),
    url: z
      .string()
      .min(1, 'URL cannot be empty')
      .describe('The URL to navigate to.'),
    waitUntil: z
      .enum(['load', 'domcontentloaded', 'networkidle0'])
      .optional()
      .describe("When to consider navigation successful. Defaults to 'load'."),
  }),
  outputs: z.tuple([
    z.object({
      type: z.literal('json'),
      value: BrowserResponseSchema,
    }),
  ]),
} satisfies $ToolParams
